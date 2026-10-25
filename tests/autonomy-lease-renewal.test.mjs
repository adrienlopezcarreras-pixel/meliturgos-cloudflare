import test from 'node:test';
import assert from 'node:assert/strict';
import { tryAcquireAutonomyRuntimeLease, renewAutonomyRuntimeLease, keepAutonomyRuntimeLeaseAlive } from '../src/evolution/autonomy-runtime-lease.js';

test('a live tick extends its lease; another owner cannot, and a stopped tick lets it expire', async () => {
  const store = new Map();
  await tryAcquireAutonomyRuntimeLease({ owner: 'a', now: 0, leaseMs: 90_000, memoryStore: store });
  assert.equal(await renewAutonomyRuntimeLease({ owner: 'b', now: 60_000, memoryStore: store }), false);
  assert.equal(await renewAutonomyRuntimeLease({ owner: 'a', now: 60_000, leaseMs: 90_000, memoryStore: store }), true);
  assert.equal((await tryAcquireAutonomyRuntimeLease({ owner: 'b', now: 120_000, memoryStore: store })).acquired, false);
  assert.equal((await tryAcquireAutonomyRuntimeLease({ owner: 'b', now: 150_001, memoryStore: store })).acquired, true);
});

test('keep-alive renews on its interval and stops when told', async () => {
  const store = new Map();
  await tryAcquireAutonomyRuntimeLease({ owner: 'a', now: Date.now(), leaseMs: 60_000, memoryStore: store });
  const before = store.get('runtime-lease:autonomy-heartbeat').expires_at;
  const stop = keepAutonomyRuntimeLeaseAlive({ owner: 'a', leaseMs: 120_000, memoryStore: store }, { everyMs: 10 });
  await new Promise(r => setTimeout(r, 40));
  stop();
  assert.ok(store.get('runtime-lease:autonomy-heartbeat').expires_at > before);
});
