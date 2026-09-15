import test from 'node:test';
import assert from 'node:assert/strict';
import {
  tryAcquireAutonomyRuntimeLease,
  releaseAutonomyRuntimeLease,
} from '../src/evolution/autonomy-runtime-lease.js';
import { runAutonomyRuntimeTick } from '../src/evolution/autonomy-runtime.js';

test('autonomy runtime lease blocks overlap, expires safely, and stale owners cannot release a newer lease', async () => {
  const memoryStore = new Map();
  const first = await tryAcquireAutonomyRuntimeLease({
    owner: 'first-owner',
    leaseMs: 60_000,
    now: 1_000,
    memoryStore,
  });
  assert.equal(first.acquired, true);
  assert.equal(first.expires_at, 61_000);

  const overlap = await tryAcquireAutonomyRuntimeLease({
    owner: 'second-owner',
    leaseMs: 60_000,
    now: 2_000,
    memoryStore,
  });
  assert.equal(overlap.acquired, false);
  assert.equal(overlap.expires_at, 61_000);

  assert.equal(await releaseAutonomyRuntimeLease({ owner: 'second-owner', memoryStore }), false);

  const takeover = await tryAcquireAutonomyRuntimeLease({
    owner: 'second-owner',
    leaseMs: 60_000,
    now: 62_000,
    memoryStore,
  });
  assert.equal(takeover.acquired, true);
  assert.equal(takeover.expires_at, 122_000);

  assert.equal(await releaseAutonomyRuntimeLease({ owner: 'first-owner', memoryStore }), false);
  assert.equal(await releaseAutonomyRuntimeLease({ owner: 'second-owner', memoryStore }), true);

  const third = await tryAcquireAutonomyRuntimeLease({
    owner: 'third-owner',
    leaseMs: 60_000,
    now: 63_000,
    memoryStore,
  });
  assert.equal(third.acquired, true);
});

test('a heartbeat that sees an active lease exits before touching runtime work', async () => {
  const memoryStore = new Map();
  const held = await tryAcquireAutonomyRuntimeLease({
    owner: 'holder',
    leaseMs: 60_000,
    now: Date.now(),
    memoryStore,
  });
  assert.equal(held.acquired, true);

  const result = await runAutonomyRuntimeTick({
    MEL_GITHUB_BRANCH: 'candidate/mel-clean-autonomy',
    MEL_TEACHER_BRANCH: 'candidate/mel-clean-autonomy',
  }, {
    runtimeLeaseOwner: 'contender',
    runtimeLeaseMs: 60_000,
    runtimeLeaseStore: memoryStore,
    repository: {
      list() { throw new Error('runtime work must not be touched while lease is busy'); },
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.skipped, true);
  assert.equal(result.status, 'SKIPPED_LEASE_BUSY');
  assert.equal(result.reason, 'AUTONOMY_RUNTIME_LEASE_BUSY');
  assert.equal(result.advanced, false);
  assert.ok(result.lease?.expires_at >= held.expires_at);

  assert.equal(await releaseAutonomyRuntimeLease({ owner: 'holder', memoryStore }), true);
});
