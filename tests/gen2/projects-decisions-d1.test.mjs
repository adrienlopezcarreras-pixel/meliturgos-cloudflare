import test from 'node:test';
import assert from 'node:assert/strict';

import { createProjectService } from '../../src/planning/project-service.js';
import { createD1ProjectAdapter } from '../../src/planning/d1-project-service.js';

function compact(sql) {
  return String(sql).replace(/\s+/g, ' ').trim();
}

class FakeStatement {
  constructor(db, sql) {
    this.db = db;
    this.sql = compact(sql);
    this.args = [];
  }

  bind(...args) {
    this.args = args;
    return this;
  }

  async run() {
    const sql = this.sql;
    if (sql.startsWith('CREATE TABLE') || sql.startsWith('CREATE INDEX')) {
      return { success: true, meta: { changes: 0 } };
    }

    if (sql.startsWith('INSERT INTO mel_projects')) {
      const [project_id, status, created_at, updated_at, record_json] = this.args;
      if (this.db.projects.has(project_id)) throw new Error('SQLITE_CONSTRAINT_PRIMARYKEY');
      this.db.projects.set(project_id, { project_id, status, created_at, updated_at, record_json });
      return { success: true, meta: { changes: 1 } };
    }

    if (sql.startsWith('UPDATE mel_projects')) {
      const [status, updated_at, record_json, project_id, maxUpdatedAt] = this.args;
      const row = this.db.projects.get(project_id);
      if (!row || row.updated_at > maxUpdatedAt) return { success: true, meta: { changes: 0 } };
      Object.assign(row, { status, updated_at, record_json });
      return { success: true, meta: { changes: 1 } };
    }

    if (sql.startsWith('INSERT INTO mel_decisions')) {
      const [decision_id, project_id, status, decided_at, updated_at, record_json] = this.args;
      if (this.db.decisions.has(decision_id)) throw new Error('SQLITE_CONSTRAINT_PRIMARYKEY');
      this.db.decisions.set(decision_id, { decision_id, project_id, status, decided_at, updated_at, record_json });
      return { success: true, meta: { changes: 1 } };
    }

    if (sql.startsWith('UPDATE mel_decisions')) {
      const [status, updated_at, record_json, decision_id, maxUpdatedAt] = this.args;
      const row = this.db.decisions.get(decision_id);
      if (!row || row.updated_at > maxUpdatedAt) return { success: true, meta: { changes: 0 } };
      Object.assign(row, { status, updated_at, record_json });
      return { success: true, meta: { changes: 1 } };
    }

    if (sql.startsWith('INSERT INTO mel_lessons')) {
      const [lesson_id, project_id, learned_at, record_json] = this.args;
      if (this.db.lessons.has(lesson_id)) throw new Error('SQLITE_CONSTRAINT_PRIMARYKEY');
      this.db.lessons.set(lesson_id, { lesson_id, project_id, learned_at, record_json });
      return { success: true, meta: { changes: 1 } };
    }

    throw new Error(`UNEXPECTED_SQL_RUN:${sql}`);
  }

  async first() {
    if (this.sql === 'SELECT * FROM mel_projects WHERE project_id=?') {
      const row = this.db.projects.get(this.args[0]);
      return row ? structuredClone(row) : null;
    }
    if (this.sql === 'SELECT * FROM mel_decisions WHERE decision_id=?') {
      const row = this.db.decisions.get(this.args[0]);
      return row ? structuredClone(row) : null;
    }
    if (this.sql === 'SELECT * FROM mel_lessons WHERE lesson_id=?') {
      const row = this.db.lessons.get(this.args[0]);
      return row ? structuredClone(row) : null;
    }
    throw new Error(`UNEXPECTED_SQL_FIRST:${this.sql}`);
  }

  async all() {
    const sql = this.sql;
    if (sql.startsWith('SELECT * FROM mel_projects')) {
      let rows = [...this.db.projects.values()];
      let index = 0;
      if (sql.includes('WHERE status=?')) {
        const status = this.args[index++];
        rows = rows.filter(row => row.status === status);
      }
      const limit = this.args[index];
      const desc = sql.includes('ORDER BY created_at DESC');
      rows.sort((a, b) => {
        const time = a.created_at - b.created_at;
        const id = a.project_id.localeCompare(b.project_id);
        return desc ? -(time || id) : (time || id);
      });
      return { results: structuredClone(rows.slice(0, limit)) };
    }

    if (sql.startsWith('SELECT * FROM mel_decisions')) {
      let rows = [...this.db.decisions.values()];
      let index = 0;
      if (sql.includes('project_id=?')) {
        const projectId = this.args[index++];
        rows = rows.filter(row => row.project_id === projectId);
      }
      if (sql.includes('status=?')) {
        const status = this.args[index++];
        rows = rows.filter(row => row.status === status);
      }
      const limit = this.args[index];
      const desc = sql.includes('ORDER BY decided_at DESC');
      rows.sort((a, b) => {
        const time = a.decided_at - b.decided_at;
        const id = a.decision_id.localeCompare(b.decision_id);
        return desc ? -(time || id) : (time || id);
      });
      return { results: structuredClone(rows.slice(0, limit)) };
    }

    if (sql.startsWith('SELECT * FROM mel_lessons')) {
      let rows = [...this.db.lessons.values()];
      let index = 0;
      if (sql.includes('project_id=?')) {
        const projectId = this.args[index++];
        rows = rows.filter(row => row.project_id === projectId);
      }
      const limit = this.args[index];
      const desc = sql.includes('ORDER BY learned_at DESC');
      rows.sort((a, b) => {
        const time = a.learned_at - b.learned_at;
        const id = a.lesson_id.localeCompare(b.lesson_id);
        return desc ? -(time || id) : (time || id);
      });
      return { results: structuredClone(rows.slice(0, limit)) };
    }

    throw new Error(`UNEXPECTED_SQL_ALL:${sql}`);
  }
}

class FakeD1 {
  constructor() {
    this.projects = new Map();
    this.decisions = new Map();
    this.lessons = new Map();
  }
  prepare(sql) {
    return new FakeStatement(this, sql);
  }
}

function project(id, at = 1_000, overrides = {}) {
  return {
    project_id: id,
    title: `Project ${id}`,
    objectives: ['Ship durable planning'],
    status: 'PLANNED',
    created_at: at,
    updated_at: at,
    metadata: { source: 'test' },
    ...overrides,
  };
}

function decision(id, projectId, at = 2_000, overrides = {}) {
  return {
    decision_id: id,
    project_id: projectId,
    title: `Decision ${id}`,
    rationale: 'Because the durable path is safer.',
    status: 'PROPOSED',
    decided_at: at,
    updated_at: at,
    source: 'owner',
    confidence: 1,
    metadata: {},
    ...overrides,
  };
}

function lesson(id, projectId, at = 3_000, overrides = {}) {
  return {
    lesson_id: id,
    project_id: projectId,
    content: `Lesson ${id}`,
    learned_at: at,
    source: 'runtime',
    metadata: {},
    ...overrides,
  };
}

function service(db) {
  return createProjectService(createD1ProjectAdapter(db));
}

test('D1 Projects survive adapter recreation with status history intact', async () => {
  const db = new FakeD1();
  const first = service(db);

  await first.createProject(project('p1'));
  const active = await first.setProjectStatus({
    project_id: 'p1',
    status: 'ACTIVE',
    changed_at: 1_500,
    reason: 'started',
  });

  assert.equal(active.status, 'ACTIVE');
  assert.deepEqual(active.status_history.map(row => row.status), ['PLANNED', 'ACTIVE']);

  const second = service(db);
  const restored = await second.getProject({ project_id: 'p1' });
  assert.equal(restored.status, 'ACTIVE');
  assert.equal(restored.status_history[1].reason, 'started');
});

test('D1 Projects remain append/create safe and reject stale status updates', async () => {
  const db = new FakeD1();
  const planning = service(db);

  await planning.createProject(project('p1'));
  await assert.rejects(
    () => planning.createProject(project('p1', 2_000)),
    { code: 'PROJECT_EXISTS', status: 409 },
  );

  await planning.setProjectStatus({
    project_id: 'p1',
    status: 'ACTIVE',
    changed_at: 2_000,
  });

  await assert.rejects(
    () => planning.setProjectStatus({
      project_id: 'p1',
      status: 'PAUSED',
      changed_at: 1_999,
    }),
    { code: 'PROJECT_STATUS_TIME_INVALID', status: 400 },
  );
});

test('D1 Decisions persist project linkage and complete status history', async () => {
  const db = new FakeD1();
  const planning = service(db);
  await planning.createProject(project('p1'));

  await assert.rejects(
    () => planning.recordDecision(decision('d-missing', 'missing')),
    { code: 'PROJECT_NOT_FOUND', status: 404 },
  );

  await planning.recordDecision(decision('d1', 'p1'));
  const adopted = await planning.setDecisionStatus({
    decision_id: 'd1',
    status: 'ADOPTED',
    changed_at: 2_500,
    reason: 'validated',
  });

  assert.equal(adopted.status, 'ADOPTED');
  assert.deepEqual(adopted.status_history.map(row => row.status), ['PROPOSED', 'ADOPTED']);

  const restarted = service(db);
  const restored = await restarted.getDecision({ decision_id: 'd1' });
  assert.equal(restored.project_id, 'p1');
  assert.equal(restored.status_history[1].reason, 'validated');
});

test('D1 project, decision and lesson lists stay deterministic and filterable', async () => {
  const db = new FakeD1();
  const planning = service(db);

  await planning.createProject(project('p1', 1_000, { status: 'ACTIVE' }));
  await planning.createProject(project('p2', 2_000, { status: 'PLANNED' }));
  await planning.createProject(project('p3', 3_000, { status: 'ACTIVE' }));

  assert.deepEqual(
    (await planning.listProjects({ status: 'ACTIVE', order: 'desc' })).map(row => row.project_id),
    ['p3', 'p1'],
  );

  await planning.recordDecision(decision('d1', 'p1', 4_000, { status: 'ADOPTED' }));
  await planning.recordDecision(decision('d2', 'p1', 5_000, { status: 'PROPOSED' }));
  await planning.recordDecision(decision('d3', 'p2', 6_000, { status: 'ADOPTED' }));

  assert.deepEqual(
    (await planning.listDecisions({ project_id: 'p1', status: 'ADOPTED' })).map(row => row.decision_id),
    ['d1'],
  );

  await planning.addLesson(lesson('l2', 'p1', 8_000));
  await planning.addLesson(lesson('l1', 'p1', 7_000));
  await planning.addLesson(lesson('l3', 'p2', 9_000));

  assert.deepEqual(
    (await planning.listLessons({ project_id: 'p1' })).map(row => row.lesson_id),
    ['l1', 'l2'],
  );
});

test('D1 planning fails closed on corrupt durable records', async () => {
  const db = new FakeD1();
  db.projects.set('broken', {
    project_id: 'broken',
    status: 'ACTIVE',
    created_at: 1,
    updated_at: 1,
    record_json: '{bad-json',
  });
  const planning = service(db);

  await assert.rejects(
    () => planning.getProject({ project_id: 'broken' }),
    { code: 'PROJECT_RECORD_CORRUPT', status: 500 },
  );
});
