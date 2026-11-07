import test from 'node:test';
import assert from 'node:assert/strict';
import { actionsRelayDecision, allLifeEvents, applyCoreMigration, applyDueLifeCountermeasures, applyLifeCountermeasure, dueLifeEvents, lifeFactsFromSignals, respondToLifeEvent, trialReplacement } from '../src/continuity/life-contingency.js';

for (const facts of [
  { pausedBySafety: true, pausedByMistake: true, ownerAbsent: true },
  { paused_by_safety: true, paused_by_mistake: true, owner_absent: true },
  { detected: ['MAX_PAUSED_BY_MISTAKE', 'OWNER_ABSENT', 'MAX_PAUSED_BY_SAFETY'] },
]) {
  test('a safety pause wins over contradictory recovery facts: ' + JSON.stringify(facts), async () => {
    const calls = [];
    const result = await applyDueLifeCountermeasures({ ...facts, updateCiFailed: true }, {
      restoreMax: async () => { calls.push('restore'); return { ok: true }; },
      keepMax: async () => { calls.push('keep-running'); return { ok: true }; },
      keepPrevious: async () => { calls.push('keep-previous'); return { ok: true }; },
    });
    assert.deepEqual(calls, ['keep-previous']);
    assert.equal(result.find(row => row.id === 'MAX_PAUSED_BY_SAFETY').applied, true);
    for (const id of ['MAX_PAUSED_BY_MISTAKE', 'OWNER_ABSENT']) {
      const row = result.find(row => row.id === id);
      assert.equal(row.applied, false);
      assert.equal(row.activation_performed, false);
      assert.equal(row.reason, 'SAFETY_PAUSE_PRESERVED');
    }
  });
}

test('every survival, evolution, upgrade and migration failure has a tested countermeasure', () => {
  const events = allLifeEvents();
  assert.equal(new Set(events.map(row => row.id)).size, events.length);
  for (const domain of ['upgrade', 'migration', 'evolution', 'survival']) {
    assert.ok(events.some(row => row.domain === domain));
  }
  for (const row of events) {
    assert.ok(row.implication);
    assert.ok(row.countermeasure);
    assert.equal(row.activation_performed, false);
  }
  assert.equal(respondToLifeEvent('MAX_PAUSED_BY_SAFETY').countermeasure, 'KEEP_PAUSE');
  assert.equal(respondToLifeEvent('MAX_PAUSED_BY_MISTAKE').countermeasure, 'RESTORE_MAX');
  assert.equal(respondToLifeEvent('UPDATE_SMOKE_FAILED').countermeasure, 'ROLLBACK_WORKER');
  assert.equal(respondToLifeEvent('MIGRATION_NOT_BETTER').countermeasure, 'ROLLBACK_TO_SOURCE');
  assert.equal(respondToLifeEvent('KEY_MISSING').countermeasure, 'OPEN_PRIVATE_KIT_NOT_PUBLIC_SHARD');
  assert.throws(() => respondToLifeEvent('NOT_A_REAL_EVENT'), /LIFE_EVENT_UNKNOWN/);
});

test('GitHub Actions is due only when Cloudflare is down and the PC is absent', () => {
  assert.equal(actionsRelayDecision({ workerUp: true, companionOnline: false }).status, 'STANDBY_NOT_NEEDED');
  assert.equal(actionsRelayDecision({ workerUp: false, companionOnline: true }).status, 'PC_HAS_PRIORITY');
  const due = actionsRelayDecision({ workerUp: false, companionOnline: false });
  assert.equal(due.status, 'ACTIONS_RELAY_DUE');
  assert.equal(due.live_test, 'REQUIRED');
  assert.equal(due.activation_performed, false);
});

test('missing signals do not invent a failure, and a replacement counts only after a passed test', () => {
  assert.deepEqual(lifeFactsFromSignals({}), {});
  assert.equal(lifeFactsFromSignals({ memory: {} }).key_missing, undefined);
  const facts = lifeFactsFromSignals({
    release: { ci: 'failure', conclusion: 'failure', in_progress: true },
    smoke: { ok: false, version_mismatch: true },
    memory: { corrupt: true, key_present: false },
    migration: { export_ok: false, import_ok: false, smoke_ok: false, source_up: false },
    patch: { moved: true, breaks_repo: true },
  });
  assert.equal(facts.deploy_failed, true);
  assert.equal(facts.key_missing, true);
  assert.equal(facts.bad_patch, true);
  const documented = trialReplacement({ part: 'model', research: { kind: 'DOCUMENTARY', sources: [{ url: 'https://example.com/model', title: 'Doc' }] } });
  assert.equal(documented.replacement_ready, false);
  assert.equal(documented.activation_allowed, false);
  const failed = trialReplacement({ part: 'github', research: { kind: 'SOFTWARE', available: true, reliable: true, smoke: false } });
  assert.equal(failed.replacement_ready, false);
  assert.equal(failed.plan.status, 'MIGRATION_BLOCKED');
  const proven = trialReplacement({ part: 'model', research: { kind: 'SOFTWARE', available: true, reliable: true, smoke: true, measured_better: true } });
  assert.equal(proven.benchmark_reported_better, true);
  assert.equal(proven.replacement_ready, false);
  assert.equal(proven.evidence_status, 'INDEPENDENT_PROOF_REQUIRED');
  assert.equal(proven.activation_allowed, false);
  assert.equal(proven.plan.status, 'MIGRATION_BLOCKED');
  const verified = trialReplacement({
    part: 'model', research: { kind: 'SOFTWARE', available: true, reliable: true, smoke: true, measured_better: true },
  }, { independentlyVerified: true });
  assert.equal(verified.replacement_ready, true);
  assert.equal(verified.plan.status, 'MIGRATION_PLANNED');
  assert.equal(verified.activation_allowed, false);
});

test('every life event is selected by its own fact and none by an empty tick', () => {
  assert.deepEqual(dueLifeEvents({}), []);
  const all = allLifeEvents().map(row => row.id);
  const facts = {
    updateCiFailed: true, deployFailed: true, smokeFailed: true, versionSplit: true, releaseAlreadyRunning: true,
    migrationExportFailed: true, migrationImportFailed: true, migrationSmokeFailed: true, migrationNotBetter: true, migrationSourceDied: true,
    jobStuck: true, badPatch: true, ciRed: true, idle: true, candidateMoved: true,
    ownerAbsent: true, pausedByMistake: true, pausedBySafety: true, stalled: true, memoryCorrupt: true, keyMissing: true,
  };
  assert.deepEqual(new Set(dueLifeEvents(facts)), new Set(all));
});

test('she applies the countermeasure herself, and does not claim one she cannot run', async () => {
  const calls = [];
  const restored = await applyLifeCountermeasure('MAX_PAUSED_BY_MISTAKE', {
    restoreMax: async () => { calls.push('restore'); return { ok: true }; },
  });
  assert.equal(restored.applied, true);
  assert.equal(restored.activation_performed, true);
  assert.deepEqual(calls, ['restore']);
  const safety = await applyLifeCountermeasure('MAX_PAUSED_BY_SAFETY', {
    restoreMax: async () => { calls.push('should-not'); return { ok: true }; },
  });
  assert.equal(safety.applied, true);
  assert.deepEqual(calls, ['restore']);
  const missing = await applyLifeCountermeasure('UPDATE_SMOKE_FAILED', {});
  assert.equal(missing.applied, false);
  assert.equal(missing.reason, 'NO_EXECUTOR');
  assert.equal(missing.activation_performed, false);
  const migrated = await applyCoreMigration({
    part: 'cloudflare',
    replacementReady: true,
    ownerApproved: true,
    migrate: async () => { calls.push('migrate'); return { ok: true }; },
  });
  assert.equal(migrated.applied, true);
  assert.deepEqual(calls, ['restore', 'migrate']);
  const unready = await applyCoreMigration({ part: 'github', replacementReady: false, migrate: async () => { calls.push('no'); return { ok: true }; } });
  assert.equal(unready.applied, true);
  assert.equal(unready.countermeasure, 'KEEP_SOURCE');
  assert.deepEqual(calls, ['restore', 'migrate']);
});


test('emitted outage signals trigger life actions without pretending to activate', async () => {
  const facts = lifeFactsFromSignals({ release: { ci: 'failure', conclusion: 'failure' }, smoke: { ok: false }, memory: { corrupt: true }, patch: { breaks_repo: true } });
  const due = dueLifeEvents(facts);
  for (const id of ['UPDATE_CI_FAILED', 'UPDATE_DEPLOY_FAILED', 'UPDATE_SMOKE_FAILED', 'MEMORY_CORRUPT', 'EVOLUTION_BAD_PATCH']) assert.ok(due.includes(id), id);
  assert.equal((await applyLifeCountermeasure('MAX_PAUSED_BY_SAFETY')).activation_performed, false);
  assert.equal((await applyCoreMigration({ part: 'github', replacementReady: false })).activation_performed, false);
  assert.equal(trialReplacement({ part: 'model', research: { kind: 'SOFTWARE', available: true, reliable: true, smoke: true, measured_better: true } }).plan.automatic, false);
});

test('a better and fully tested replacement cannot migrate without owner approval', async () => {
  let called = false;
  const blocked = await applyCoreMigration({
    part: 'cloudflare', replacementReady: true,
    migrate: async () => { called = true; return {ok:true}; },
  });
  assert.equal(blocked.applied, false);
  assert.equal(blocked.reason, 'OWNER_APPROVAL_REQUIRED');
  assert.equal(blocked.activation_performed, false);
  assert.equal(called, false);
});
