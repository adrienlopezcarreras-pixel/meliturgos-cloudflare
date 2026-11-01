import test from 'node:test';
import assert from 'node:assert/strict';
import {
  tryAcquireAutonomyRuntimeLease,
  releaseAutonomyRuntimeLease,
  renewAutonomyRuntimeLease,
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

test('an owner tick waits for the active lease instead of skipping the step', async () => {
  const memoryStore = new Map();
  const held = await tryAcquireAutonomyRuntimeLease({
    owner: 'heartbeat',
    leaseMs: 60_000,
    now: Date.now(),
    memoryStore,
  });
  assert.equal(held.acquired, true);
  let calls = 0;
  const repository = new Proxy({}, {
    get() {
      return () => { calls += 1; throw new Error('REACHED_WORK'); };
    },
  });

  let result = null;
  try {
    result = await runAutonomyRuntimeTick({
      MEL_GITHUB_BRANCH: 'candidate/mel-clean-autonomy',
      MEL_TEACHER_BRANCH: 'candidate/mel-clean-autonomy',
    }, {
      runtimeLeaseOwner: 'owner',
      runtimeLeaseStore: memoryStore,
      ownerLeaseWaitMs: 5_000,
      repository,
      sleep: async () => {
        await releaseAutonomyRuntimeLease({ owner: 'heartbeat', memoryStore });
      },
    });
  } catch (error) {
    assert.match(String(error?.message || error), /REACHED_WORK/);
    assert.equal(calls > 0, true);
    return;
  }
  assert.notEqual(result?.status, 'SKIPPED_LEASE_BUSY');
  assert.equal(calls > 0, true, JSON.stringify(result));
});

test('a lease left by a killed invocation frees itself within 90 s (next minute tick)', async () => {
  const { tryAcquireAutonomyRuntimeLease } = await import('../src/evolution/autonomy-runtime-lease.js');
  const store = new Map();
  const first = await tryAcquireAutonomyRuntimeLease({ owner: 'killed', now: 0, memoryStore: store });
  assert.equal(first.expires_at, 90_000);
  assert.equal((await tryAcquireAutonomyRuntimeLease({ owner: 'next', now: 60_000, memoryStore: store })).acquired, false);
  assert.equal((await tryAcquireAutonomyRuntimeLease({ owner: 'next', now: 120_000, memoryStore: store })).acquired, true);
});

test('expired owner cannot resurrect a lease; a fresh owner can acquire it', async () => {
  const memoryStore = new Map();
  assert.equal((await tryAcquireAutonomyRuntimeLease({ owner: 'old', now: 1000, leaseMs: 60000, memoryStore })).acquired, true);
  assert.equal(await renewAutonomyRuntimeLease({ owner: 'old', now: 61000, memoryStore }), false);
  assert.equal((await tryAcquireAutonomyRuntimeLease({ owner: 'new', now: 61000, leaseMs: 60000, memoryStore })).acquired, true);
  assert.equal(await renewAutonomyRuntimeLease({ owner: 'old', now: 62000, memoryStore }), false);
  assert.equal(await renewAutonomyRuntimeLease({ owner: 'new', now: 62000, memoryStore }), true);
});

test('D1-style SQLite renewal refuses expired leases and old owners', async () => {
  const { DatabaseSync } = await import('node:sqlite');
  const sqlite = new DatabaseSync(':memory:');
  try {
    sqlite.exec('CREATE TABLE dev_bridge_state (bridge_id TEXT PRIMARY KEY, last_seen INTEGER, status TEXT, metadata_json TEXT)');
    const db = { prepare(sql) {
      const stmt = sqlite.prepare(sql);
      return { bind(...params) {
        return {
          async run() { const out = stmt.run(...params); return { meta: { changes: out.changes } }; },
          async first() { return stmt.get(...params) || null; },
        };
      } };
    } };
    const old = await tryAcquireAutonomyRuntimeLease({ db, owner: 'old', now: 1000, leaseMs: 60000 });
    assert.equal(old.acquired, true);
    assert.equal(await renewAutonomyRuntimeLease({ db, owner: 'old', now: 61000 }), false);
    assert.equal((await tryAcquireAutonomyRuntimeLease({ db, owner: 'new', now: 61000, leaseMs: 60000 })).acquired, true);
    assert.equal(await renewAutonomyRuntimeLease({ db, owner: 'old', now: 62000 }), false);
    assert.equal(await renewAutonomyRuntimeLease({ db, owner: 'new', now: 62000 }), true);
    assert.equal(await releaseAutonomyRuntimeLease({ db, owner: 'old' }), false);
  } finally {
    sqlite.close();
  }
});

test('lease renewal never shortens a valid expiry when the clock moves backward', async () => {
  const memoryStore = new Map();
  const first = await tryAcquireAutonomyRuntimeLease({ owner: 'owner', now: 100_000, leaseMs: 90_000, memoryStore });
  assert.equal(first.expires_at, 190_000);
  assert.equal(await renewAutonomyRuntimeLease({ owner: 'owner', now: 80_000, leaseMs: 60_000, memoryStore }), true);
  assert.equal(memoryStore.get(first.key).expires_at, 190_000);
  const { DatabaseSync } = await import('node:sqlite');
  const sqlite = new DatabaseSync(':memory:');
  try {
    sqlite.exec('CREATE TABLE dev_bridge_state (bridge_id TEXT PRIMARY KEY, last_seen INTEGER, status TEXT, metadata_json TEXT)');
    const db = { prepare(sql) {
      const stmt = sqlite.prepare(sql);
      return { bind(...params) {
        return {
          async run() { const result = stmt.run(...params); return { meta: { changes: result.changes } }; },
          async first() { return stmt.get(...params) || null; },
        };
      } };
    } };
    const acquired = await tryAcquireAutonomyRuntimeLease({ db, owner: 'owner', now: 100_000, leaseMs: 90_000 });
    assert.equal(acquired.acquired, true);
    assert.equal(await renewAutonomyRuntimeLease({ db, owner: 'owner', now: 80_000, leaseMs: 60_000 }), true);
    const row = await db.prepare('SELECT last_seen FROM dev_bridge_state WHERE bridge_id=?').bind(acquired.key).first();
    assert.equal(row.last_seen, 190_000);
  } finally {
    sqlite.close();
  }
});


test('MEL-MANIFEST-02: an interruption between two writes resumes the same checkpoint after lease expiry, without double step or new job', async () => {
  const lease = await import('../src/evolution/autonomy-runtime-lease.js');
  const memoryStore = new Map();
  const t0 = 1_000_000;
  const first = await lease.tryAcquireAutonomyRuntimeLease({ memoryStore, owner: 'tick-1', now: t0 });
  assert.equal(first.acquired, true);
  const begun = await lease.beginAutonomyCheckpoint({ memoryStore, owner: 'tick-1', jobId: 'job-A', step: 'bridge', now: t0 });
  assert.equal(begun.run, true);
  // tick-1 is killed after its first write: no complete, no release.
  assert.equal((await lease.tryAcquireAutonomyRuntimeLease({ memoryStore, owner: 'tick-2', now: t0 + 30_000 })).acquired, false);
  const expired = t0 + lease.AUTONOMY_RUNTIME_LEASE_MS + 1;
  assert.equal((await lease.tryAcquireAutonomyRuntimeLease({ memoryStore, owner: 'tick-2', now: expired })).acquired, true);
  assert.deepEqual(await lease.pendingAutonomyCheckpoint({ memoryStore }), { job_id: 'job-A', step: 'bridge', attempts: 1 });
  const resumed = await lease.beginAutonomyCheckpoint({ memoryStore, owner: 'tick-2', jobId: 'job-A', step: 'bridge', now: expired });
  assert.equal(resumed.run, true);
  assert.equal(resumed.resumed, true);
  assert.equal(resumed.checkpoint.job_id, 'job-A', 'same job, not a new one');
  assert.equal(resumed.checkpoint.started_at, t0);
  assert.equal(await lease.completeAutonomyCheckpoint({ memoryStore, jobId: 'job-A', step: 'bridge', now: expired + 1 }), true);
  assert.equal(await lease.pendingAutonomyCheckpoint({ memoryStore }), null);
  const again = await lease.beginAutonomyCheckpoint({ memoryStore, owner: 'tick-3', jobId: 'job-A', step: 'bridge', now: expired + 2 });
  assert.equal(again.run, false, 'a DONE step never runs twice');
  assert.equal(again.reason, 'STEP_ALREADY_DONE');
});

test('MEL-MANIFEST-02: the checkpoint survives in D1', async () => {
  const { sqliteD1 } = await import('./helpers/sqlite-d1.mjs');
  const lease = await import('../src/evolution/autonomy-runtime-lease.js');
  const db = sqliteD1();
  try {
    await db.prepare('CREATE TABLE IF NOT EXISTS dev_bridge_state (bridge_id TEXT PRIMARY KEY, last_seen INTEGER, status TEXT, metadata_json TEXT)').run();
    await lease.beginAutonomyCheckpoint({ db, owner: 'a', jobId: 'job-B', step: 'council', now: 5 });
    assert.deepEqual(await lease.pendingAutonomyCheckpoint({ db }), { job_id: 'job-B', step: 'council', attempts: 1 });
    await lease.completeAutonomyCheckpoint({ db, jobId: 'job-B', step: 'council', now: 6 });
    assert.equal(await lease.pendingAutonomyCheckpoint({ db }), null);
  } finally { db.close(); }
});
