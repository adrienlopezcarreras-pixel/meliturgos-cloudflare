import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultCapabilityBus } from '../src/capabilities/default-bus.js';
import { D1WorkDagStore } from '../src/work/d1-work-dag-store.js';

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

const context = { owner: 'adrien', requestId: 'work-test', permissions: [] };

function addArtifactCapability(bus) {
  bus.discover({
    id: 'fixture.artifact', name: 'Artifact fixture', category: 'test', version: '1.0.0', provider: 'test',
    description: 'Produces one harmless artifact for Work persistence tests.',
    input_schema: { type: 'object', properties: { value: { type: 'string', minLength: 1, maxLength: 100 } }, required: ['value'], additionalProperties: false },
    output_schema: { type: 'object', additionalProperties: true },
    risk: 'LOW', permissions: [], health: 'HEALTHY', enabled: true,
  }, async input => ({ ok: true, artifacts: [{ kind: 'text', name: 'proof.txt', value: input.value }] }));
}

test('default bus exposes truthful persistent Work capabilities', () => {
  const unavailable = createDefaultCapabilityBus({ env: {} });
  for (const id of ['work.create', 'work.run', 'work.status', 'work.artifacts']) {
    assert.equal(unavailable.describe(id).health, 'DEGRADED');
  }
  assert.equal(unavailable.describe('work.status').risk, 'LOW');
  assert.equal(unavailable.describe('work.create').risk, 'MEDIUM');
  assert.equal(unavailable.describe('work.run').risk, 'MEDIUM');

  const db = new FakeD1();
  const available = createDefaultCapabilityBus({ env: { DB: db } });
  for (const id of ['work.create', 'work.run', 'work.status', 'work.artifacts']) {
    assert.equal(available.describe(id).health, 'HEALTHY');
  }
});

test('Work survives a new bus instance with state, checkpoints and artifacts intact', async () => {
  const db = new FakeD1();
  const firstBus = createDefaultCapabilityBus({ env: { DB: db } });
  addArtifactCapability(firstBus);

  const created = await firstBus.execute('work.create', {
    id: 'durable-work-1',
    goal: 'Prove durable multi-step work',
    nodes: [
      { id: 'one', kind: 'TASK', idempotent: true, payload: { capability: 'fixture.artifact', input: { value: 'persisted' } } },
      { id: 'two', kind: 'TASK', depends_on: ['one'], idempotent: true, payload: { capability: 'echo', input: { value: 'done' } } },
    ],
  }, context);
  assert.equal(created.status, 'RUNNING');
  assert.equal(created.completed, false);
  assert.ok(created.checkpoint_count >= 1);

  const completed = await firstBus.execute('work.run', { id: 'durable-work-1' }, context);
  assert.equal(completed.status, 'COMPLETED');
  assert.equal(completed.completed, true);
  assert.equal(completed.artifact_count, 1);
  assert.ok(completed.checkpoint_count >= 5);

  const secondBus = createDefaultCapabilityBus({ env: { DB: db } });
  const restored = await secondBus.execute('work.status', { id: 'durable-work-1' }, context);
  assert.equal(restored.status, 'COMPLETED');
  assert.equal(restored.completed, true);
  assert.equal(restored.artifact_count, 1);

  const artifacts = await secondBus.execute('work.artifacts', { id: 'durable-work-1' }, context);
  assert.equal(artifacts.artifacts.length, 1);
  assert.equal(artifacts.artifacts[0].node_id, 'one');
  assert.equal(artifacts.artifacts[0].artifact.name, 'proof.txt');
  assert.equal(artifacts.artifacts[0].artifact.value, 'persisted');
});

test('persistent Work keeps recursive work execution fail-closed', async () => {
  const db = new FakeD1();
  const bus = createDefaultCapabilityBus({ env: { DB: db } });
  await bus.execute('work.create', {
    id: 'recursive-work', goal: 'Must not recurse',
    nodes: [{ id: 'loop', kind: 'TASK', idempotent: true, payload: { capability: 'work.status', input: { id: 'recursive-work' } } }],
  }, context);
  const result = await bus.execute('work.run', { id: 'recursive-work' }, context);
  assert.equal(result.status, 'BLOCKED');
  assert.equal(result.blocked, true);
});

test('D1 Work store detects corrupt persisted state instead of guessing', async () => {
  const db = new FakeD1();
  db.rows.set('broken', { record_json: '{not-json' });
  const store = new D1WorkDagStore(db, 'broken');
  await assert.rejects(() => store.load(), error => error.code === 'WORK_DAG_STORE_CORRUPT');
});

test('Work execution fails closed when durable D1 is unavailable', async () => {
  const bus = createDefaultCapabilityBus({ env: {} });
  await assert.rejects(
    () => bus.execute('work.status', { id: 'missing' }, context),
    error => error.code === 'WORK_DAG_DB_REQUIRED'
  );
});
