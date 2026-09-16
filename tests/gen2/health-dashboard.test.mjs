import test from 'node:test';
import assert from 'node:assert/strict';
import { buildHealthDashboard } from '../../src/diagnostics/health-dashboard.js';

const NOW = '2026-09-16T10:15:00.000Z';

function healthyInput(overrides = {}) {
  return {
    readiness: { state: 'READY', percent: 100, critical_ready: 3, critical_total: 3 },
    bindings: { ai: true, db: true, media_bucket: true, owner: true, github_repository: true, github_branch: 'candidate/mel-clean-autonomy' },
    selfCode: { branch_known: true, commit_known: true, exact_identity_known: true },
    critical: { conversation: true, memory_db: true, ai: true },
    capabilities: { total: 4, health: { HEALTHY: 4 } },
    models: { configured: 3, explicit_zero_cost: 2 },
    blockers: [],
    now: NOW,
    ...overrides,
  };
}

test('health dashboard is OK when all observed components are healthy', () => {
  const result = buildHealthDashboard(healthyInput());
  assert.equal(result.ok, true);
  assert.equal(result.state, 'OK');
  assert.equal(result.generated_at, NOW);
  assert.equal(result.summary.ERROR, 0);
  assert.equal(result.summary.WARN, 0);
  assert.deepEqual(result.alerts, []);
});

test('critical readiness and capability failures become ERROR alerts', () => {
  const result = buildHealthDashboard(healthyInput({
    readiness: { state: 'DEGRADED', percent: 45, critical_ready: 1, critical_total: 3 },
    critical: { conversation: true, memory_db: false, ai: false },
    capabilities: { total: 5, health: { HEALTHY: 3, FAILED: 2 } },
  }));
  assert.equal(result.ok, false);
  assert.equal(result.state, 'ERROR');
  assert.deepEqual(result.alerts[0], { severity: 'ERROR', code: 'CRITICAL_NOT_READY', items: ['ai', 'memory_db'] });
  assert.deepEqual(result.alerts[1], { severity: 'ERROR', code: 'CAPABILITY_FAILURES', count: 2 });
});

test('unknown capability health, missing bindings and deployment identity degrade to WARN', () => {
  const input = healthyInput();
  input.readiness = { state: 'PARTIAL', percent: 82, critical_ready: 2, critical_total: 3 };
  input.bindings.ai = false;
  input.selfCode = { branch_known: true, commit_known: false, exact_identity_known: false };
  input.capabilities = { total: 4, health: { HEALTHY: 3, UNKNOWN: 1 } };
  const result = buildHealthDashboard(input);
  assert.equal(result.ok, true);
  assert.equal(result.state, 'WARN');
  assert.ok(result.alerts.some(x => x.code === 'MISSING_BINDINGS'));
  assert.ok(result.alerts.some(x => x.code === 'CAPABILITY_HEALTH_UNKNOWN'));
  assert.ok(result.alerts.some(x => x.code === 'DEPLOYMENT_IDENTITY_INCOMPLETE'));
});

test('roadmap blockers are surfaced as informational evidence without becoming ERROR', () => {
  const result = buildHealthDashboard(healthyInput({ blockers: [{ id: 'GEN2-33' }, { id: 'GEN2-35' }] }));
  assert.equal(result.state, 'WARN');
  assert.deepEqual(result.alerts.at(-1), { severity: 'INFO', code: 'ROADMAP_BLOCKERS', count: 2 });
  assert.equal(result.components.find(x => x.id === 'roadmap').evidence.count, 2);
});

test('dashboard output exposes health facts but never echoes arbitrary environment or secret values', () => {
  const input = healthyInput({
    bindings: { ai: true, db: true, media_bucket: true, owner: true, github_repository: true, github_branch: 'candidate/mel-clean-autonomy', API_TOKEN: 'secret-value' },
  });
  const serialized = JSON.stringify(buildHealthDashboard(input));
  assert.equal(serialized.includes('secret-value'), false);
  assert.equal(serialized.includes('API_TOKEN'), true); // only the missing/presence key can appear if false; never the value
});
