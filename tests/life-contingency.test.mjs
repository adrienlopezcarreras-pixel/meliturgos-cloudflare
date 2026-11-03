import test from 'node:test';
import assert from 'node:assert/strict';
import { actionsRelayDecision, allLifeEvents, respondToLifeEvent } from '../src/continuity/life-contingency.js';

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
