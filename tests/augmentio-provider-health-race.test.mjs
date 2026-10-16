import test from 'node:test';
import assert from 'node:assert/strict';
import { ProviderPool } from '../src/augmentio/provider-pool.js';
import { ProviderAdapter } from '../src/augmentio/provider-adapter.js';

test('an older timed-out health probe cannot quarantine a newly recovered provider', async () => {
  let releaseOld;
  let oldStarted;
  const started = new Promise(resolve => { oldStarted = resolve; });
  let calls = 0;
  const adapter = {
    id: 'recovering', capabilities: ['GENERAL'], invoke: async () => 'answer',
    health: async () => {
      if (++calls === 1) {
        oldStarted();
        return new Promise(resolve => { releaseOld = resolve; });
      }
      return 'HEALTHY';
    },
  };
  const pool = new ProviderPool([adapter], { healthCheckTimeoutMs: 25 });
  const first = pool.refreshHealth();
  await started;
  await pool.refreshHealth();
  assert.equal(adapter.healthStatus, 'HEALTHY');
  await first; // The older health probe times out after the newer one succeeded.
  assert.equal(adapter.healthStatus, 'HEALTHY');
  assert.deepEqual(pool.list({ capability: 'GENERAL' }).map(row => row.id), ['recovering']);
  releaseOld('UNAVAILABLE');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(adapter.healthStatus, 'HEALTHY', 'late old reply cannot override latest probe');
});

test('an earlier rejected health probe cannot downgrade a newer successful result', async () => {
  let rejectOld;
  let oldStarted;
  const started = new Promise(resolve => { oldStarted = resolve; });
  let calls = 0;
  const adapter = {
    id: 'recovered', invoke: async () => 'ok',
    health: async () => {
      if (++calls === 1) {
        oldStarted();
        return new Promise((_, reject) => { rejectOld = reject; });
      }
      return 'HEALTHY';
    },
  };
  const pool = new ProviderPool([adapter], { healthCheckTimeoutMs: 25 });
  const first = pool.refreshHealth();
  await started;
  await pool.refreshHealth();
  rejectOld(new Error('stale provider failure'));
  await first;
  assert.equal(adapter.healthStatus, 'HEALTHY');
});

test('ProviderAdapter ignores older asynchronous health status that resolves last', async () => {
  let releaseOld;
  let oldStarted;
  const started = new Promise(resolve => { oldStarted = resolve; });
  let calls = 0;
  const adapter = new ProviderAdapter({
    id: 'model-1', invoke: async () => 'ok',
    healthCheck: async () => {
      if (++calls === 1) {
        oldStarted();
        return new Promise(resolve => { releaseOld = resolve; });
      }
      return 'HEALTHY';
    },
  });
  const first = adapter.health();
  await started;
  assert.equal(await adapter.health(), 'HEALTHY');
  releaseOld('UNAVAILABLE');
  await first;
  assert.equal(adapter.healthStatus, 'HEALTHY');
});
