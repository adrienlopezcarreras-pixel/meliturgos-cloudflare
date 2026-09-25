import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createD1ProjectAdapter,
  createInMemoryProjectAdapter,
  createProjectService,
  decisionEntity,
  projectEntity,
} from '../../src/planning/project-service.js';
import { DB_SCHEMA_VERSION } from '../../src/core/config.js';
import { prepareGen2 } from '../../src/persistence/gen2-schema.js';
import { migrate } from '../../src/persistence/migrations.js';
import { sqliteD1 } from '../helpers/sqlite-d1.mjs';

const project = (project_id, created_at = 1000, overrides = {}) => ({
  project_id,
  title: `Project ${project_id}`,
  objectives: ['Ship safely', 'Learn from outcomes'],
  status: 'ACTIVE',
  created_at,
  updated_at: created_at,
  metadata: {},
  ...overrides,
});

const decision = (decision_id, project_id, decided_at = 1500, overrides = {}) => ({
  decision_id,
  project_id,
  title: `Decision ${decision_id}`,
  rationale: 'Best available option',
  status: 'ADOPTED',
  decided_at,
  updated_at: decided_at,
  source: 'user',
  confidence: 1,
  metadata: {},
  ...overrides,
});

test('project and decision entities validate, normalize and initialize status history', () => {
  const normalizedProject = projectEntity(project('  p-1  ', 1000, { title: '  MEL Roadmap  ' }));
  assert.equal(normalizedProject.project_id, 'p-1');
  assert.equal(normalizedProject.title, 'MEL Roadmap');
  assert.deepEqual(normalizedProject.status_history, [{ status: 'ACTIVE', changed_at: 1000, reason: 'created' }]);

  const normalizedDecision = decisionEntity(decision('  d-1  ', '  p-1  ', 1200));
  assert.equal(normalizedDecision.decision_id, 'd-1');
  assert.equal(normalizedDecision.project_id, 'p-1');
  assert.deepEqual(normalizedDecision.status_history, [{ status: 'ADOPTED', changed_at: 1200, reason: 'created' }]);

  assert.throws(() => projectEntity(project('p-bad', 1, { objectives: ['same', 'same'] })), { code: 'PROJECT_OBJECTIVES_INVALID' });
  assert.throws(() => decisionEntity(decision('d-bad', 'p-1', 1, { confidence: 2 })), { code: 'DECISION_CONFIDENCE_INVALID' });
});

test('planning port remains fail-closed and adapter-driven', async () => {
  const missing = createProjectService();
  await assert.rejects(() => missing.createProject(project('p-1')), { code: 'NOT_IMPLEMENTED:planning.projects.createProject' });

  const service = createProjectService(createInMemoryProjectAdapter());
  assert.equal((await service.createProject(project('p-1'))).project_id, 'p-1');
});

test('projects are append-only identities with deterministic listing and status history', async () => {
  const service = createProjectService(createInMemoryProjectAdapter());
  await service.createProject(project('p-b', 2000, { status: 'PLANNED' }));
  await service.createProject(project('p-a', 1000));

  assert.deepEqual((await service.listProjects()).map(item => item.project_id), ['p-a', 'p-b']);
  assert.deepEqual((await service.listProjects({ status: 'PLANNED' })).map(item => item.project_id), ['p-b']);

  const paused = await service.setProjectStatus({ project_id: 'p-a', status: 'PAUSED', changed_at: 3000, reason: 'dependency blocked' });
  assert.equal(paused.status, 'PAUSED');
  assert.equal(paused.status_history.length, 2);
  assert.deepEqual(paused.status_history.at(-1), { status: 'PAUSED', changed_at: 3000, reason: 'dependency blocked' });

  await assert.rejects(() => service.createProject(project('p-a', 4000)), { code: 'PROJECT_EXISTS', status: 409 });
  await assert.rejects(() => service.setProjectStatus({ project_id: 'p-a', status: 'ACTIVE', changed_at: 2500 }), { code: 'PROJECT_STATUS_TIME_INVALID' });
});

test('decisions remain linked to projects and preserve past status changes', async () => {
  const service = createProjectService(createInMemoryProjectAdapter({ projects: [project('p-1')] }));
  await service.recordDecision(decision('d-2', 'p-1', 2000));
  await service.recordDecision(decision('d-1', 'p-1', 1500, { status: 'PROPOSED' }));

  const adopted = await service.setDecisionStatus({ decision_id: 'd-1', status: 'ADOPTED', changed_at: 2500, reason: 'validated by tests' });
  assert.equal(adopted.status, 'ADOPTED');
  assert.deepEqual(adopted.status_history.map(item => item.status), ['PROPOSED', 'ADOPTED']);
  assert.equal(adopted.status_history.at(-1).reason, 'validated by tests');

  assert.deepEqual((await service.listDecisions({ project_id: 'p-1' })).map(item => item.decision_id), ['d-1', 'd-2']);
  assert.deepEqual((await service.listDecisions({ project_id: 'p-1', status: 'ADOPTED' })).map(item => item.decision_id), ['d-1', 'd-2']);

  await assert.rejects(() => service.recordDecision(decision('d-x', 'missing')), { code: 'PROJECT_NOT_FOUND', status: 404 });
  await assert.rejects(() => service.setDecisionStatus({ decision_id: 'd-1', status: 'REVERSED', changed_at: 2000 }), { code: 'DECISION_STATUS_TIME_INVALID' });
});

test('lessons require an existing project, are readable, ordered and defensively cloned', async () => {
  const service = createProjectService(createInMemoryProjectAdapter({ projects: [project('p-1'), project('p-2', 1100)] }));
  const input = {
    lesson_id: 'l-2',
    project_id: 'p-1',
    content: 'Keep roadmap work isolated by branch.',
    learned_at: 3000,
    source: 'review',
    metadata: { severity: 'high' },
  };
  const saved = await service.addLesson(input);
  await service.addLesson({ ...input, lesson_id: 'l-1', content: 'Check candidate HEAD before integration.', learned_at: 2000 });
  await service.addLesson({ ...input, lesson_id: 'l-other', project_id: 'p-2', learned_at: 1000 });
  input.metadata.severity = 'mutated';
  assert.equal(saved.metadata.severity, 'high');
  assert.equal((await service.getLesson({ lesson_id: 'l-2' })).metadata.severity, 'high');
  assert.deepEqual((await service.listLessons({ project_id: 'p-1' })).map(item => item.lesson_id), ['l-1', 'l-2']);

  await assert.rejects(() => service.getLesson({ lesson_id: 'missing' }), { code: 'LESSON_NOT_FOUND', status: 404 });
  await assert.rejects(() => service.addLesson({ ...input, lesson_id: 'l-x', project_id: 'missing' }), { code: 'PROJECT_NOT_FOUND', status: 404 });
});

test('returned project and decision values cannot mutate stored state', async () => {
  const service = createProjectService(createInMemoryProjectAdapter({
    projects: [project('p-1')],
    decisions: [decision('d-1', 'p-1')],
  }));

  const externalProject = await service.getProject({ project_id: 'p-1' });
  externalProject.objectives.push('Injected');
  assert.deepEqual((await service.getProject({ project_id: 'p-1' })).objectives, ['Ship safely', 'Learn from outcomes']);

  const externalDecision = await service.getDecision({ decision_id: 'd-1' });
  externalDecision.status_history.push({ status: 'REVERSED', changed_at: 9999 });
  assert.deepEqual((await service.getDecision({ decision_id: 'd-1' })).status_history.map(item => item.status), ['ADOPTED']);
});


test('GEN2-13 D1 adapter persists projects decisions and lessons across service instances', async () => {
  const db = sqliteD1();
  try {
    await prepareGen2(db);
    const first = createProjectService(createD1ProjectAdapter(db));
    await first.createProject(project('p-1'));
    await first.recordDecision(decision('d-1', 'p-1', 1500, { status: 'PROPOSED' }));
    await first.addLesson({
      lesson_id: 'l-1',
      project_id: 'p-1',
      content: 'Persist project learning.',
      learned_at: 1600,
      source: 'review',
      metadata: { severity: 'high' },
    });
    await first.setProjectStatus({
      project_id: 'p-1',
      status: 'PAUSED',
      changed_at: 2000,
      reason: 'dependency',
    });
    await first.setDecisionStatus({
      decision_id: 'd-1',
      status: 'ADOPTED',
      changed_at: 2100,
      reason: 'validated',
    });

    const second = createProjectService(createD1ProjectAdapter(db));
    const restoredProject = await second.getProject({ project_id: 'p-1' });
    const restoredDecision = await second.getDecision({ decision_id: 'd-1' });
    const restoredLesson = await second.getLesson({ lesson_id: 'l-1' });

    assert.equal(restoredProject.status, 'PAUSED');
    assert.deepEqual(restoredProject.status_history.map(item => item.status), ['ACTIVE', 'PAUSED']);
    assert.equal(restoredDecision.status, 'ADOPTED');
    assert.deepEqual(restoredDecision.status_history.map(item => item.status), ['PROPOSED', 'ADOPTED']);
    assert.equal(restoredLesson.metadata.severity, 'high');
    assert.deepEqual((await second.listProjects({ status: 'PAUSED' })).map(item => item.project_id), ['p-1']);
    assert.deepEqual((await second.listDecisions({ project_id: 'p-1', status: 'ADOPTED' })).map(item => item.decision_id), ['d-1']);
    assert.deepEqual((await second.listLessons({ project_id: 'p-1' })).map(item => item.lesson_id), ['l-1']);

    await assert.rejects(() => second.createProject(project('p-1')), { code: 'PROJECT_EXISTS', status: 409 });
    await assert.rejects(() => second.recordDecision(decision('d-2', 'missing')), { code: 'PROJECT_NOT_FOUND', status: 404 });
    await assert.rejects(
      () => second.setProjectStatus({ project_id: 'p-1', status: 'COMPLETED', changed_at: 2000 }),
      { code: 'PROJECT_STATUS_TIME_INVALID', status: 400 },
    );
    await assert.rejects(
      () => second.setDecisionStatus({ decision_id: 'd-1', status: 'REVERSED', changed_at: 2100 }),
      { code: 'DECISION_STATUS_TIME_INVALID', status: 400 },
    );
  } finally {
    db.close();
  }
});

test('GEN2-13 migration v13 provisions durable planning tables', async () => {
  const db = sqliteD1();
  try {
    const result = await migrate(db);
    assert.equal(result.currentVersion, DB_SCHEMA_VERSION);
    assert.equal(DB_SCHEMA_VERSION, 13);

    for (const table of ['planning_projects', 'planning_decisions', 'planning_lessons']) {
      const row = await db.prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
      ).bind(table).first();
      assert.equal(row?.name, table);
    }
  } finally {
    db.close();
  }
});
