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

// 02/11 : une sonde de release instable a mis MAX en pause toute la nuit, et
// rien ne le redémarrait. Le retour arrière doit toujours stopper MAX pendant
// l'échange du code, mais ensuite MAX repart seul — sauf si c'est le
// propriétaire qui l'a arrêté.
test('MAX repart seul après un retour arrière, jamais après un arrêt propriétaire', async () => {
  const c = await import('../src/evolution/autonomy-control.js');
  const state = c.createAutonomyControlMemoryState();

  await c.setAutonomyControl(null, { memoryState: state, paused: false, max_autonomy: true });
  const rollback = await c.setAutonomyControl(null, {
    memoryState: state, paused: true, max_autonomy: false,
    source: c.ROLLBACK_PAUSE_SOURCE, reason: c.ROLLBACK_PAUSE_REASON,
  });

  // La pause reste : le code est échangé sous MEL, MAX doit être coupé.
  assert.equal(rollback.paused, true, 'le retour arrière coupe toujours MAX');
  assert.equal(rollback.max_autonomy, false);
  // Mais le choix du propriétaire survit, au lieu d'être détruit, et MAX repart.
  assert.equal(rollback.max_remembered, true, 'le choix MAX du propriétaire survit au retour arrière');
  assert.equal(c.shouldResumeAfterRollback(rollback), true, 'MAX repart seul après un retour arrière');

  // Même après de nombreux retours arrière, MAX repart toujours : la seule
  // chose qui l'arrête, c'est le propriétaire.
  assert.equal(c.shouldResumeAfterRollback({ ...rollback, rollback_count: 99 }), true,
    'MAX repart quel que soit le nombre de retours arrière');

  // Un arrêt du propriétaire n'est JAMAIS repris tout seul.
  const ownerStop = await c.setAutonomyControl(null, {
    memoryState: state, paused: true, max_autonomy: false, source: 'owner-ui', reason: 'owner-stop',
  });
  assert.equal(c.shouldResumeAfterRollback(ownerStop), false, 'un arrêt propriétaire ne repart jamais seul');

  // Un retour arrière sans MAX avant ne réveille rien.
  assert.equal(c.shouldResumeAfterRollback({ ...rollback, max_remembered: false }), false);
  assert.equal(c.shouldRestoreOwnerMax(rollback), true);
  assert.equal(c.shouldRestoreOwnerMax({
    paused: true, max_remembered: true, source: 'release-launch-bootstrap', reason: 'NEW_RELEASE_AWAITING_OWNER_LAUNCH',
  }), true, 'une release terminée relance MAX si le propriétaire l’avait choisi');
  assert.equal(c.shouldRestoreOwnerMax({
    paused: true, max_remembered: true, source: 'release-predeploy-binder', reason: 'predeploy-release-safety',
  }), false, 'la pause courte de déploiement n’est pas une reprise');
  assert.equal(c.shouldRestoreOwnerMax(ownerStop), false);
});
