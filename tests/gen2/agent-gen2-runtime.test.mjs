import test from 'node:test';
import assert from 'node:assert/strict';

import { createGen2Runtime } from '../../src/core/orchestrator/gen2-runtime.js';
import { sqliteD1 } from '../helpers/sqlite-d1.mjs';

const context = { owner: 'runtime', permissions: [], requestId: 'agent-gen2' };

test('Gen2 agents facade is backed by the canonical durable agent registry and Work DAG runtime', async (t) => {
  const db = sqliteD1();
  t.after(() => db.close());

  const first = createGen2Runtime({ env: { DB: db }, audit: async () => {} });
  const registered = await first.agents.register('durable-agent', [
    { capability: 'echo', input: { value: 'persisted' }, idempotent: true },
  ]);
  assert.equal(registered.status, 'ACTIVE');
  assert.deepEqual(registered.required_capabilities, ['echo']);

  const second = createGen2Runtime({ env: { DB: db }, audit: async () => {} });
  const restored = await second.agents.get('durable-agent');
  assert.equal(restored.version, '1.0.0');
  assert.equal(restored.status, 'ACTIVE');

  const run = await second.agents.run({
    agent_id: 'durable-agent',
    run_id: 'durable-agent-run',
  }, context);
  assert.equal(run.status, 'COMPLETED');
  assert.deepEqual(run.results, [{ value: 'persisted' }]);
  assert.equal((await second.agents.getRun({ run_id: 'durable-agent-run' })).summary.completed, true);

  assert.equal((await second.agents.disable('durable-agent')).status, 'DISABLED');
  await assert.rejects(
    () => second.agents.run({ agent_id: 'durable-agent', run_id: 'disabled-run' }, context),
    { code: 'AGENT_DISABLED', status: 409 },
  );
});

test('legacy agents register/run API still maps onto Work DAG execution instead of a local Map', async () => {
  const runtime = createGen2Runtime({ audit: async () => {} });
  const registered = await runtime.agents.register('legacy-agent', [
    { capability: 'echo', input: { value: 'legacy-ok' } },
  ]);
  assert.equal(registered.steps, 1);

  const result = await runtime.agents.run('legacy-agent', context);
  assert.equal(result.status, 'COMPLETED');
  assert.deepEqual(result.results, [{ value: 'legacy-ok' }]);
  assert.equal(result.dag.job_id, 'agent:legacy-agent');
});
