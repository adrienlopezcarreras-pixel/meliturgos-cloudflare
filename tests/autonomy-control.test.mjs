import test from 'node:test';
import assert from 'node:assert/strict';
import { createAutonomyControlMemoryState, getAutonomyControl, setAutonomyControl, setOwnerMaxAutonomy, resetAutonomyControlForTests } from '../src/evolution/autonomy-control.js';
import { runAutonomyRuntimeTick } from '../src/evolution/autonomy-runtime.js';
import { sqliteD1 } from './helpers/sqlite-d1.mjs';

test('autonomy emergency pause persists only in explicitly injected fallback state and blocks a runtime heartbeat', async () => {
  const autonomyControlState = createAutonomyControlMemoryState();
  resetAutonomyControlForTests(autonomyControlState);
  const paused = await setAutonomyControl(null, { paused: true, source: 'test', reason: 'owner-emergency-stop', memoryState: autonomyControlState });
  assert.equal(paused.paused, true);
  assert.equal((await getAutonomyControl(null, { memoryState: autonomyControlState })).status, 'PAUSED');

  const tick = await runAutonomyRuntimeTick({}, { autonomyControlState });
  assert.equal(tick.status, 'PAUSED');
  assert.equal(tick.paused, true);
  assert.equal(tick.advanced, false);

  const resumed = await setAutonomyControl(null, { paused: false, source: 'test', reason: null, memoryState: autonomyControlState });
  assert.equal(resumed.paused, false);
  assert.equal((await getAutonomyControl(null, { memoryState: autonomyControlState })).status, 'RUNNING');
  resetAutonomyControlForTests(autonomyControlState);
});

test('MAX autonomy is independent from emergency pause and survives pause/resume with explicit fallback state', async () => {
  const autonomyControlState = createAutonomyControlMemoryState();
  resetAutonomyControlForTests(autonomyControlState);
  const maximum = await setOwnerMaxAutonomy(null, { enabled: true, source: 'test', memoryState: autonomyControlState });
  assert.equal(maximum.max_autonomy, true);
  assert.equal(maximum.owner_override, true);
  assert.equal(maximum.status, 'MAX_AUTONOMY');

  const paused = await setAutonomyControl(null, { paused: true, source: 'test', memoryState: autonomyControlState });
  assert.equal(paused.paused, true);
  assert.equal(paused.max_autonomy, true);
  assert.equal(paused.status, 'PAUSED');

  const resumed = await setAutonomyControl(null, { paused: false, source: 'test', reason: null, memoryState: autonomyControlState });
  assert.equal(resumed.paused, false);
  assert.equal(resumed.max_autonomy, true);
  assert.equal(resumed.status, 'MAX_AUTONOMY');

  const normal = await setOwnerMaxAutonomy(null, { enabled: false, source: 'test', memoryState: autonomyControlState });
  assert.equal(normal.max_autonomy, false);
  assert.equal(normal.status, 'RUNNING');
  resetAutonomyControlForTests(autonomyControlState);
});


test('autonomy control writes fail closed without D1 or explicit memory state', async () => {
  await assert.rejects(
    () => setAutonomyControl(null, { paused: true, source: 'test' }),
    (error) => error?.code === 'AUTONOMY_CONTROL_DB_REQUIRED' && error?.status === 503,
  );
  await assert.rejects(
    () => setOwnerMaxAutonomy(null, { enabled: true, source: 'test' }),
    (error) => error?.code === 'AUTONOMY_CONTROL_DB_REQUIRED' && error?.status === 503,
  );
});

test('release predeploy pause writes exact PAUSED state without reading or migrating first', async () => {
  const statements = [];
  const db = {
    prepare(sql) {
      const statement = String(sql);
      statements.push(statement);
      return {
        bind() { return this; },
        async run() {
          assert.match(statement, /INSERT INTO dev_bridge_state/);
          return { success: true };
        },
        async first() {
          throw new Error('PREDEPLOY_CONTROL_READ_FORBIDDEN');
        },
        async all() {
          throw new Error('PREDEPLOY_MIGRATION_FORBIDDEN');
        },
      };
    },
  };

  const paused = await setAutonomyControl(db, {
    paused: true,
    max_autonomy: false,
    source: 'release-launch-bootstrap',
    reason: 'NEW_RELEASE_AWAITING_OWNER_LAUNCH',
    launch_approved_sha: null,
    launch_approved_at: null,
    launch_gate_digest: null,
  });

  assert.equal(paused.paused, true);
  assert.equal(paused.max_autonomy, false);
  assert.equal(paused.status, 'PAUSED');
  assert.equal(paused.source, 'release-launch-bootstrap');
  assert.equal(paused.reason, 'NEW_RELEASE_AWAITING_OWNER_LAUNCH');
  assert.equal(statements.length, 1);
  assert.match(statements[0], /INSERT INTO dev_bridge_state/);
  assert.doesNotMatch(statements[0], /SELECT/i);
});

test('persistent D1 autonomy control is fail-closed PAUSED until the owner explicitly enables it', async () => {
  const db = sqliteD1();
  try {
    const initial = await getAutonomyControl(db);
    assert.equal(initial.paused, true);
    assert.equal(initial.status, 'PAUSED');
    assert.equal(initial.source, 'default-d1-fail-closed');
    assert.equal(initial.reason, 'OWNER_ENABLE_REQUIRED');

    const resumed = await setAutonomyControl(db, { paused: false, source: 'test-owner-enable', reason: null });
    assert.equal(resumed.paused, false);
    assert.equal(resumed.status, 'RUNNING');
    assert.equal((await getAutonomyControl(db)).status, 'RUNNING');
  } finally {
    db.close();
  }
});
