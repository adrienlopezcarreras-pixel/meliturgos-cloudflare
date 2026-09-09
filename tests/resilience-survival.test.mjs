import test from 'node:test';
import assert from 'node:assert/strict';
import { SurvivalMode, SURVIVAL_STATES } from '../src/resilience/survival-mode.js';
import { ResilienceManager } from '../src/resilience/resilience-manager.js';

test('survival mode degrades after repeated failures', () => {
  let now = 1_000;
  const survival = new SurvivalMode({ now: () => now, maxRecentFailures: 3, failureWindowMs: 60_000 });
  survival.recordFailure({ reason: 'x1' });
  survival.recordFailure({ reason: 'x2' });
  survival.recordFailure({ reason: 'x3' });
  assert.equal(survival.state, SURVIVAL_STATES.DEGRADED);
  assert.equal(survival.canDeploy(), false);
});

test('critical incident freezes writes/deployments and emits sanitized incident report', async () => {
  const calls = [];
  const manager = new ResilienceManager({
    checkpoint: async () => ({ id: 'cp-1', secret: 'must-not-leak' }),
    verifyIntegrity: async () => false,
    pauseDeployments: async () => calls.push('deploy-paused'),
    freezeSensitiveWrites: async () => calls.push('writes-frozen'),
    notify: async (report) => calls.push(report),
  });
  const report = await manager.handleIncident({ severity: 'critical', reason: 'integrity anomaly', token: 'hidden', allowAuthorizedRollback: true });
  assert.equal(manager.survival.state, SURVIVAL_STATES.READ_ONLY);
  assert.deepEqual(calls.slice(0, 2), ['deploy-paused', 'writes-frozen']);
  assert.equal(report.event.token, undefined);
  assert.equal(report.checkpoint.secret, undefined);
  assert.equal(report.autoRestoreEligible, true);
});

test('owner halt always wins and blocks recovery', async () => {
  const manager = new ResilienceManager({ restoreLastKnownGood: async () => ({ ok: true }), verifyIntegrity: async () => true });
  manager.ownerHalt();
  const result = await manager.recover({ approved: true });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'OWNER_HALT_ACTIVE');
  assert.equal(manager.survival.state, SURVIVAL_STATES.HALTED);
});

test('approved recovery returns to normal only after integrity verification', async () => {
  let verified = false;
  const manager = new ResilienceManager({
    restoreLastKnownGood: async () => ({ restored: true }),
    verifyIntegrity: async () => verified,
  });
  manager.survival.enterReadOnly('test');
  let result = await manager.recover({ approved: true });
  assert.equal(result.ok, false);
  assert.equal(manager.survival.state, SURVIVAL_STATES.READ_ONLY);

  verified = true;
  result = await manager.recover({ approved: true });
  assert.equal(result.ok, true);
  assert.equal(manager.survival.state, SURVIVAL_STATES.NORMAL);
});
