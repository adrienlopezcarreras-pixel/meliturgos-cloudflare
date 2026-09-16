import test from 'node:test';
import assert from 'node:assert/strict';
import { buildUnifiedHealthDashboard } from '../src/diagnostics/system-readiness.js';

function healthySnapshot() {
  return {
    bindings: { ai: true, db: true, media_bucket: true },
    self_code: { exact_identity_known: true, branch: 'release/example', commit: 'a'.repeat(40) },
    critical: {
      conversation: true,
      memory_db: true,
      ai: true,
      capability_bus: true,
      persistent_work_registered: true,
      multi_ai_registered: true,
      multi_ai_zero_cost_candidates: true,
      code_reader_registered: true,
      code_integrity_registered: true,
      roadmap_available: true,
    },
    capabilities: { total: 42 },
    models: { explicit_zero_cost: 3 },
    roadmap: { total: 100 },
    blockers: [],
  };
}

test('GEN2-44 exposes one unified, non-secret health dashboard', () => {
  const dashboard = buildUnifiedHealthDashboard(healthySnapshot());
  assert.equal(dashboard.schema, 'mel.health-dashboard.v1');
  assert.equal(dashboard.state, 'HEALTHY');
  assert.equal(dashboard.summary.sections, 5);
  assert.equal(dashboard.summary.critical_failures, 0);
  assert.deepEqual(dashboard.sections.map(section => section.id), ['runtime', 'persistence', 'intelligence', 'code', 'governance']);
  assert.equal(dashboard.alerts.length, 0);
});

test('GEN2-44 distinguishes critical degradation from warnings', () => {
  const snapshot = healthySnapshot();
  snapshot.bindings.db = false;
  snapshot.critical.memory_db = false;
  snapshot.self_code.exact_identity_known = false;
  snapshot.blockers = [{ id: 'GEN2-33', status: 'BLOCKED_HUMAN' }];
  const dashboard = buildUnifiedHealthDashboard(snapshot);
  assert.equal(dashboard.state, 'DEGRADED');
  assert.equal(dashboard.summary.critical_failures, 1);
  assert.ok(dashboard.summary.warnings >= 2);
  assert.ok(dashboard.alerts.some(alert => alert.id === 'memory_db' && alert.severity === 'critical'));
  assert.ok(dashboard.alerts.some(alert => alert.id === 'deployment_identity'));
});
