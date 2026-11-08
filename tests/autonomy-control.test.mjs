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
  const again = await c.setAutonomyControl(null, {
    memoryState: state, paused: true, max_autonomy: false,
    source: c.ROLLBACK_PAUSE_SOURCE, reason: c.ROLLBACK_PAUSE_REASON,
  });
  assert.equal(again.max_remembered, true, 'un second retour arrière ne détruit pas le choix');
  assert.equal(c.shouldRestoreOwnerMax({ ...again, max_remembered: false }), true,
    'un retour arrière dont le drapeau a été effacé repart quand même');

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
    paused: true, max_remembered: true, source: null, reason: null,
  }), true, 'un choix MAX conservé sans libellé de pause repart quand même');
  assert.equal(c.shouldRestoreOwnerMax({
    paused: true, max_remembered: true, source: 'release-predeploy-binder', reason: 'predeploy-release-safety',
  }), false, 'la pause courte de déploiement n’est pas une reprise');
  assert.equal(c.shouldRestoreOwnerMax(ownerStop), false);
  assert.equal(c.shouldRestoreOwnerMax({
    paused: true, max_remembered: true, source: 'owner-ui', reason: 'owner-emergency-stop',
  }), false, 'le coupe-circuit propriétaire gagne même si le choix MAX est encore noté');
  assert.equal(c.isTechnicalAutonomyPause({
    paused: true, max_remembered: false, source: null, reason: null,
    owner_control_version: 100, updated_at: 200,
  }), true, 'une pause de release qui a effacé le drapeau reste une pause technique');
  assert.equal(c.isTechnicalAutonomyPause({
    paused: true, max_remembered: false, source: 'owner-ui', reason: 'owner-stop',
    owner_control_version: 100, updated_at: 200,
  }), false, 'un arrêt propriétaire n’est jamais une pause technique');
  assert.equal(c.isTechnicalAutonomyPause({
    paused: true, owner_stopped: true, source: null, reason: null,
    owner_control_version: 100, updated_at: 200,
  }), false);
  assert.equal(c.isTechnicalAutonomyPause({
    paused: true, max_remembered: false, source: null, reason: null,
    owner_control_version: 200, updated_at: 200,
  }), false, 'le propriétaire a écrit cette pause');
});

test('legacy MAX disabled by owner is reconciled into a durable pause before any tick', async () => {
  const { isLegacyOwnerMaxStop } = await import('../src/evolution/autonomy-control.js');
  const db = sqliteD1();
  try {
    // Reproduce the pre-fix /max {enabled:false} metadata written in production.
    await setOwnerMaxAutonomy(db, { enabled: true, paused: false, source: 'owner-ui-launch-gate', reason: 'owner-max-autonomy' });
    const legacy = await setOwnerMaxAutonomy(db, { enabled: false, source: 'owner-ui', reason: null });
    assert.equal(legacy.paused, false);
    assert.equal(legacy.max_autonomy, false);
    assert.equal(isLegacyOwnerMaxStop(legacy), true);
    const tick = await runAutonomyRuntimeTick({ DB: db });
    assert.equal(tick.status, 'PAUSED');
    assert.equal(tick.advanced, false);
    const control = await getAutonomyControl(db);
    assert.equal(control.paused, true);
    assert.equal(control.reason, 'owner-stop');
    assert.equal(control.source, 'owner-ui');
    assert.equal(control.max_remembered, false);
    assert.equal(isLegacyOwnerMaxStop(control), false);
    const second = await runAutonomyRuntimeTick({ DB: db });
    assert.equal(second.status, 'PAUSED');
    assert.equal(second.advanced, false);
    assert.equal((await getAutonomyControl(db)).owner_control_version, control.owner_control_version);
  } finally { db.close(); }
});

test('legacy owner-stop detection excludes normal owner resume, release pause and MAX', async () => {
  const { isLegacyOwnerMaxStop } = await import('../src/evolution/autonomy-control.js');
  assert.equal(isLegacyOwnerMaxStop({ paused: false, max_autonomy: false, source: 'owner-ui-launch-gate', reason: null }), false);
  assert.equal(isLegacyOwnerMaxStop({ paused: true, max_autonomy: false, source: 'owner-ui', reason: 'owner-stop' }), false);
  assert.equal(isLegacyOwnerMaxStop({ paused: false, max_autonomy: true, source: 'owner-ui' }), false);
});

test('failed mission repair PAUSE cannot be overwritten or auto-resumed by a release', async () => {
  const {
    isMissionRepairAutonomyPause, shouldRestoreOwnerMax, isTechnicalAutonomyPause,
  } = await import('../src/evolution/autonomy-control.js');
  const db=sqliteD1();
  try {
    await setOwnerMaxAutonomy(db, {
      enabled:true, paused:false, source:'owner-ui-launch-gate', reason:'owner-max-autonomy',
    });
    const repair=await setAutonomyControl(db, {
      paused:true, max_autonomy:false, source:'bridge-repair-pause',
      reason:'bridge-repair-required:mel-autonomy-mel-audit-02',
    });
    assert.equal(isMissionRepairAutonomyPause(repair),true);
    assert.equal(shouldRestoreOwnerMax(repair),false);
    assert.equal(isTechnicalAutonomyPause(repair),false);
    const release=await setAutonomyControl(db, {
      paused:true, max_autonomy:false,
      source:'release-predeploy-binder', reason:'predeploy-release-safety',
      expected_updated_at:repair.updated_at,
    });
    const persisted=await getAutonomyControl(db);
    assert.equal(release.paused,true);
    assert.equal(persisted.source,'bridge-repair-pause');
    assert.equal(persisted.reason,repair.reason);
    assert.equal(persisted.max_autonomy,false);
    assert.equal(persisted.max_remembered,false);
    assert.equal(shouldRestoreOwnerMax(persisted),false);
    assert.equal(isMissionRepairAutonomyPause(persisted),true);
  } finally { db.close(); }
});
