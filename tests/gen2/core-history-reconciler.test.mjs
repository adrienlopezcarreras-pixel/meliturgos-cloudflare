import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createEventBus,
  createInMemoryEventBusAdapter,
} from '../../src/events/event-bus.js';
import {
  createInMemoryProjectAdapter,
  createProjectService,
} from '../../src/planning/project-service.js';
import {
  CoreHistoryEventReconciler,
} from '../../src/events/core-history-reconciler.js';

async function planningFixture() {
  const planning = createProjectService(createInMemoryProjectAdapter());

  await planning.createProject({
    project_id: 'p1',
    title: 'Durable core',
    objectives: ['Persist state'],
    status: 'PLANNED',
    created_at: 1_000,
    updated_at: 1_000,
    metadata: {},
  });
  await planning.setProjectStatus({
    project_id: 'p1',
    status: 'ACTIVE',
    changed_at: 1_500,
    reason: 'work started',
  });

  await planning.recordDecision({
    decision_id: 'd1',
    project_id: 'p1',
    title: 'Use durable histories',
    rationale: 'They can be replayed after a crash.',
    status: 'PROPOSED',
    decided_at: 2_000,
    updated_at: 2_000,
    source: 'owner',
    confidence: 1,
    metadata: {},
  });
  await planning.setDecisionStatus({
    decision_id: 'd1',
    status: 'ADOPTED',
    changed_at: 2_500,
    reason: 'validated',
  });

  await planning.addLesson({
    lesson_id: 'l1',
    project_id: 'p1',
    content: 'Reconcile from durable history instead of trusting one-shot callbacks.',
    learned_at: 3_000,
    source: 'runtime',
    metadata: {},
  });

  return planning;
}

function workFixture() {
  const dag = {
    id: 'work-1',
    job_id: 'job-1',
    status: 'COMPLETED',
    audit: [
      { event: 'WORK_DAG_CREATED', at: 1_100 },
      { event: 'WORK_NODE_STARTED', at: 1_200, node_id: 'n1', kind: 'TASK', attempt: 1 },
      { event: 'WORK_NODE_COMPLETED', at: 1_300, node_id: 'n1', kind: 'TASK' },
      { event: 'WORK_DAG_COMPLETED', at: 1_400 },
    ],
  };
  return {
    list: async () => ({
      work: [{ id: 'work-1', job_id: 'job-1', status: 'COMPLETED' }],
    }),
    load: async id => id === 'work-1' ? structuredClone(dag) : null,
  };
}

test('planning history reconciliation emits project, decision and lesson lifecycle events', async () => {
  const bus = createEventBus(createInMemoryEventBusAdapter());
  const planning = await planningFixture();
  const reconciler = new CoreHistoryEventReconciler({ eventBus: bus, planning });

  const result = await reconciler.reconcilePlanning();

  assert.deepEqual(result.scanned, { projects: 1, decisions: 1, lessons: 1 });
  assert.equal(result.emitted, 5);
  assert.equal(result.deduplicated, 0);

  const rows = await bus.list();
  assert.deepEqual(rows.map(row => row.event.topic), [
    'project.created',
    'project.status',
    'decision.recorded',
    'decision.status',
    'lesson.added',
  ]);
  assert.equal(rows[1].event.payload.status, 'ACTIVE');
  assert.equal(rows[3].event.payload.status, 'ADOPTED');
});

test('reconciliation is replay-safe after restart and does not duplicate events', async () => {
  const adapter = createInMemoryEventBusAdapter();
  const firstBus = createEventBus(adapter);
  const planning = await planningFixture();
  const first = new CoreHistoryEventReconciler({ eventBus: firstBus, planning });

  const initial = await first.reconcilePlanning();
  assert.equal(initial.deduplicated, 0);

  const restartedBus = createEventBus(adapter);
  const restarted = new CoreHistoryEventReconciler({ eventBus: restartedBus, planning });
  const replay = await restarted.reconcilePlanning();

  assert.equal(replay.emitted, initial.emitted);
  assert.equal(replay.deduplicated, initial.emitted);
  assert.equal((await restartedBus.list()).length, initial.emitted);
});

test('Work audit reconciliation emits only meaningful lifecycle facts', async () => {
  const bus = createEventBus(createInMemoryEventBusAdapter());
  const reconciler = new CoreHistoryEventReconciler({
    eventBus: bus,
    workHistory: workFixture(),
  });

  const result = await reconciler.reconcileWork();
  assert.equal(result.scanned.work_dags, 1);
  assert.equal(result.emitted, 3);

  const rows = await bus.list();
  assert.deepEqual(rows.map(row => row.event.topic), [
    'work.created',
    'work.running',
    'work.completed',
  ]);
  assert.equal(rows.some(row => row.event.payload.audit_event === 'WORK_NODE_COMPLETED'), false);
});

test('Work reconciliation recovers missed failure and resume events idempotently', async () => {
  const dag = {
    id: 'work-recovery',
    job_id: 'job-recovery',
    status: 'RUNNING',
    audit: [
      { event: 'WORK_DAG_CREATED', at: 1_000 },
      { event: 'WORK_NODE_FAILED', at: 2_000, node_id: 'n1', code: 'TEMPORARY' },
      { event: 'WORK_NODE_RECOVERED_FOR_RETRY', at: 3_000, node_id: 'n1' },
      { event: 'WORK_NODE_STARTED', at: 4_000, node_id: 'n1', kind: 'TASK', attempt: 2 },
    ],
  };
  const workHistory = {
    list: async () => ({ work: [{ id: dag.id }] }),
    load: async () => structuredClone(dag),
  };
  const bus = createEventBus(createInMemoryEventBusAdapter());
  const reconciler = new CoreHistoryEventReconciler({ eventBus: bus, workHistory });

  const first = await reconciler.reconcileWork();
  const second = await reconciler.reconcileWork();

  assert.deepEqual((await bus.list()).map(row => row.event.topic), [
    'work.created',
    'work.failed',
    'work.resumable',
    'work.running',
  ]);
  assert.equal(first.deduplicated, 0);
  assert.equal(second.deduplicated, 4);
});

test('reconcileAll can rebuild both planning and Work event streams in one bounded pass', async () => {
  const bus = createEventBus(createInMemoryEventBusAdapter());
  const reconciler = new CoreHistoryEventReconciler({
    eventBus: bus,
    planning: await planningFixture(),
    workHistory: workFixture(),
  });

  const result = await reconciler.reconcileAll({
    planningLimit: 20,
    workLimit: 20,
  });

  assert.equal(result.planning.emitted, 5);
  assert.equal(result.work.emitted, 3);
  assert.equal((await bus.list()).length, 8);
});
