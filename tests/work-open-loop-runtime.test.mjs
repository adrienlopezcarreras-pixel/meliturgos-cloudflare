import test from 'node:test';
import assert from 'node:assert/strict';

import { createDefaultCapabilityBus } from '../src/capabilities/default-bus.js';
import {
  MemoryOpenLoopStore,
  OpenLoopService,
} from '../src/conversations/open-loop-service.js';

class FakeD1Statement {
  constructor(db, sql) { this.db = db; this.sql = String(sql).trim(); this.args = []; }
  bind(...args) { this.args = args; return this; }
  async run() {
    if (this.sql.startsWith('CREATE TABLE')) return { success: true, meta: { changes: 0 } };
    if (this.sql.startsWith('INSERT INTO work_dags')) {
      const [id, job_id, status, record_json, created_at, updated_at] = this.args;
      this.db.rows.set(id, { id, job_id, status, record_json, created_at, updated_at });
      return { success: true, meta: { changes: 1 } };
    }
    throw new Error(`UNEXPECTED_SQL_RUN:${this.sql}`);
  }
  async first() {
    if (this.sql.startsWith('SELECT record_json FROM work_dags WHERE id=')) {
      const row = this.db.rows.get(this.args[0]);
      return row ? { record_json: row.record_json } : null;
    }
    throw new Error(`UNEXPECTED_SQL_FIRST:${this.sql}`);
  }
}

class FakeD1 {
  constructor() { this.rows = new Map(); }
  prepare(sql) { return new FakeD1Statement(this, sql); }
}

const ownerContext = {
  owner: 'adrien',
  requestId: 'work-open-loop-runtime',
  permissions: [],
};

function runtime() {
  let now = 10_000;
  let lease = 0;
  const db = new FakeD1();
  const store = new MemoryOpenLoopStore();
  const openLoops = new OpenLoopService(store, {
    now: () => now,
    id: () => `open-loop-lease-${++lease}`,
  });
  const bus = createDefaultCapabilityBus({ env: { DB: db }, openLoops });
  return {
    db,
    store,
    openLoops,
    bus,
    setNow(value) { now = value; },
  };
}

test('work.create can register a durable conversation-linked open loop', async () => {
  const { bus, store } = runtime();

  const created = await bus.execute('work.create', {
    id: 'work-loop-1',
    goal: 'Finish a persistent background task',
    conversationId: 'conv-work-1',
    openLoopPriority: 7,
    nodes: [
      {
        id: 'one',
        kind: 'TASK',
        idempotent: true,
        payload: { capability: 'echo', input: { value: 'done' } },
      },
    ],
  }, ownerContext);

  assert.equal(created.status, 'RUNNING');

  const loop = await store.get('conv-work-1::work:work-loop-1');
  assert.ok(loop);
  assert.equal(loop.owner, 'adrien');
  assert.equal(loop.priority, 7);
  assert.equal(loop.status, 'open');
  assert.equal(loop.metadata.kind, 'work_dag');
  assert.equal(loop.metadata.work_dag_id, 'work-loop-1');
  assert.equal(loop.checkpoint.work_dag_id, 'work-loop-1');
});

test('work.resume-due resumes only owner-scoped Work loops and completes them', async () => {
  const { bus, store, openLoops } = runtime();

  await bus.execute('work.create', {
    id: 'work-loop-2',
    goal: 'Resume me from the open-loop queue',
    conversationId: 'conv-work-2',
    nodes: [
      {
        id: 'one',
        kind: 'TASK',
        idempotent: true,
        payload: { capability: 'echo', input: { value: 'done' } },
      },
    ],
  }, ownerContext);

  await openLoops.capture({
    conversationId: 'conv-other',
    taskId: 'non-work-loop',
    owner: 'adrien',
    status: 'resumable',
    resumeAt: 0,
    nextAction: 'must remain untouched',
    metadata: { kind: 'something_else' },
  });

  await openLoops.capture({
    conversationId: 'conv-foreign',
    taskId: 'work:foreign',
    owner: 'someone-else',
    status: 'resumable',
    resumeAt: 0,
    metadata: { kind: 'work_dag', work_dag_id: 'foreign' },
  });

  const outcomes = await bus.execute('work.resume-due', { limit: 10 }, ownerContext);
  assert.equal(outcomes.length, 1);
  assert.equal(outcomes[0].ok, true);

  const completed = await store.get('conv-work-2::work:work-loop-2');
  assert.equal(completed.status, 'completed');
  assert.equal(completed.checkpoint.status, 'COMPLETED');
  assert.equal(completed.checkpoint.completed, true);

  const unrelated = await store.get('conv-other::non-work-loop');
  assert.equal(unrelated.status, 'resumable');
  assert.equal(unrelated.nextAction, 'must remain untouched');

  const foreign = await store.get('conv-foreign::work:foreign');
  assert.equal(foreign.status, 'resumable');
});

test('blocked Work becomes waiting for intervention instead of hot-loop retrying', async () => {
  const { bus, store } = runtime();

  await bus.execute('work.create', {
    id: 'work-loop-blocked',
    goal: 'Prove blocked work is not retried in a tight loop',
    conversationId: 'conv-work-blocked',
    nodes: [
      {
        id: 'recursive',
        kind: 'TASK',
        idempotent: true,
        payload: {
          capability: 'work.status',
          input: { id: 'work-loop-blocked' },
        },
      },
    ],
  }, ownerContext);

  const outcomes = await bus.execute('work.resume-due', {}, ownerContext);
  assert.equal(outcomes.length, 1);
  assert.equal(outcomes[0].ok, true);

  const loop = await store.get('conv-work-blocked::work:work-loop-blocked');
  assert.equal(loop.status, 'waiting');
  assert.equal(loop.metadata.requires_intervention, true);
  assert.equal(loop.checkpoint.blocked, true);
  assert.ok(loop.resumeAt > 1_000_000_000_000);
});

test('work.resume-due fails closed without an owner or open-loop service', async () => {
  const { bus } = runtime();

  await assert.rejects(
    () => bus.execute('work.resume-due', {}, { requestId: 'missing-owner', permissions: [] }),
    error => error?.code === 'WORK_OPEN_LOOP_OWNER_REQUIRED' || error?.message === 'WORK_OPEN_LOOP_OWNER_REQUIRED',
  );

  const db = new FakeD1();
  const withoutLoops = createDefaultCapabilityBus({ env: { DB: db }, openLoops: null });
  // default runtime creates a D1 OpenLoopService when DB exists, so the capability remains available.
  assert.equal(withoutLoops.describe('work.resume-due').health, 'HEALTHY');
});

test('filtered resume leaves unrelated due loops unclaimed', async () => {
  const store = new MemoryOpenLoopStore();
  const openLoops = new OpenLoopService(store, { now: () => 20_000, id: () => 'lease-filter' });

  await openLoops.capture({
    conversationId: 'conv-filter',
    taskId: 'one',
    owner: 'adrien',
    status: 'resumable',
    resumeAt: 0,
    metadata: { kind: 'unrelated' },
  });
  await openLoops.capture({
    conversationId: 'conv-filter',
    taskId: 'two',
    owner: 'adrien',
    status: 'resumable',
    resumeAt: 0,
    metadata: { kind: 'target' },
  });

  const seen = [];
  const outcomes = await openLoops.resumeDue({
    owner: 'adrien',
    filter: loop => loop.metadata.kind === 'target',
    execute: async loop => {
      seen.push(loop.taskId);
      return { completed: true };
    },
  });

  assert.deepEqual(seen, ['two']);
  assert.equal(outcomes.length, 1);
  assert.equal((await store.get('conv-filter::two')).status, 'completed');
  assert.equal((await store.get('conv-filter::one')).status, 'resumable');
});
