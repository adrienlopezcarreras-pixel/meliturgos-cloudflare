import test from 'node:test';
import assert from 'node:assert/strict';
import { createGen2Runtime } from '../src/core/orchestrator/gen2-runtime.js';

const context = { owner: 'truth-audit', permissions: [], requestId: 'work-capabilities-truth' };

function byId(runtime, id) {
  return runtime.bus.list().find((row) => row.id === id);
}

test('work read capabilities are declared low-risk and non-mutating', () => {
  const runtime = createGen2Runtime({ env: {} });
  for (const id of ['work.status', 'work.artifacts']) {
    const row = byId(runtime, id);
    assert.ok(row, `${id} must be registered`);
    assert.equal(row.risk, 'LOW');
    assert.deepEqual(row.permissions, []);
    assert.equal(row.enabled, true);
    assert.equal(row.health, 'DEGRADED');
  }
});

test('work read capabilities fail closed without the D1 binding', async () => {
  const runtime = createGen2Runtime({ env: {} });
  for (const id of ['work.status', 'work.artifacts']) {
    await assert.rejects(
      () => runtime.bus.execute(id, { id: 'missing-dag' }, context),
      (error) => error?.code === 'WORK_DAG_DB_REQUIRED' || error?.message === 'WORK_DAG_DB_REQUIRED',
      `${id} must refuse execution when durable state is unavailable`,
    );
  }
});
