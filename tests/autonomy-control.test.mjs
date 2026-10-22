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

test('emergency pause dominates MAX and resume stays normal until MAX is explicitly re-enabled', async () => {
  const autonomyControlState = createAutonomyControlMemoryState();
  resetAutonomyControlForTests(autonomyControlState);
  const maximum = await setOwnerMaxAutonomy(null, { enabled: true, source: 'test', memoryState: autonomyControlState });
  assert.equal(maximum.max_autonomy, true);
  assert.equal(maximum.owner_override, true);
  assert.equal(maximum.status, 'MAX_AUTONOMY');

  const paused = await setAutonomyControl(null, { paused: true, source: 'test', memoryState: autonomyControlState });
  assert.equal(paused.paused, true);
  assert.equal(paused.max_autonomy, false);
  assert.equal(paused.owner_override, false);
  assert.equal(paused.status, 'PAUSED');

  const resumed = await setAutonomyControl(null, { paused: false, source: 'test', reason: null, memoryState: autonomyControlState });
  assert.equal(resumed.paused, false);
  assert.equal(resumed.max_autonomy, false);
  assert.equal(resumed.status, 'RUNNING');

  const maximumAgain = await setOwnerMaxAutonomy(null, { enabled: true, paused: false, source: 'test', memoryState: autonomyControlState });
  assert.equal(maximumAgain.max_autonomy, true);
  assert.equal(maximumAgain.status, 'MAX_AUTONOMY');
  resetAutonomyControlForTests(autonomyControlState);
});

test('legacy contradictory paused plus MAX memory state is normalized fail-safe to PAUSED', async () => {
  const autonomyControlState = createAutonomyControlMemoryState();
  autonomyControlState.control = {
    paused: true,
    max_autonomy: true,
    owner_override: true,
    status: 'PAUSED',
    source: 'legacy-test',
  };
  const control = await getAutonomyControl(null, { memoryState: autonomyControlState });
  assert.equal(control.paused, true);
  assert.equal(control.max_autonomy, false);
  assert.equal(control.owner_override, false);
  assert.equal(control.status, 'PAUSED');
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

test('release pauses preserve persisted owner intent while owner and safety stops advance it', async () => {
  const db=sqliteD1();
  try {
    const active=await setOwnerMaxAutonomy(db,{enabled:true,source:'owner-ui'});
    assert.equal(active.owner_control_version,active.updated_at);
    const paused=await setAutonomyControl(db,{paused:true,source:'release-predeploy-binder',reason:'predeploy-release-safety'});
    assert.ok(paused.updated_at>active.updated_at);
    assert.equal(paused.owner_control_version,active.owner_control_version);
    const repeated=await setAutonomyControl(db,{paused:true,source:'release-launch-bootstrap',reason:'NEW_RELEASE_AWAITING_OWNER_LAUNCH'});
    assert.ok(repeated.updated_at>paused.updated_at);
    assert.equal((await getAutonomyControl(db)).owner_control_version,active.owner_control_version);
    const stopped=await setAutonomyControl(db,{paused:true,source:'owner-ui',reason:'owner-stop'});
    assert.ok(stopped.owner_control_version>active.owner_control_version);
    const preserved=await setAutonomyControl(db,{paused:true,source:'release-launch-bootstrap',reason:'NEW_RELEASE_AWAITING_OWNER_LAUNCH'});
    assert.equal(preserved.source,'owner-ui');
    assert.equal(preserved.owner_control_version,stopped.owner_control_version);
    const safety=await setAutonomyControl(db,{paused:true,source:'watchdog',reason:'safety-stop'});
    assert.ok(safety.owner_control_version>stopped.owner_control_version);
  } finally { db.close(); }
});

test('legacy control metadata derives owner version before its first technical pause', async () => {
  const memoryState=createAutonomyControlMemoryState();
  memoryState.control={paused:false,max_autonomy:true,status:'MAX_AUTONOMY',updated_at:100,source:'owner-ui'};
  const legacy=await getAutonomyControl(null,{memoryState});
  assert.equal(legacy.owner_control_version,100);
  const paused=await setAutonomyControl(null,{paused:true,source:'release-predeploy-binder',reason:'predeploy-release-safety',memoryState});
  assert.equal(paused.owner_control_version,100);
  assert.ok(paused.updated_at>100);
});
