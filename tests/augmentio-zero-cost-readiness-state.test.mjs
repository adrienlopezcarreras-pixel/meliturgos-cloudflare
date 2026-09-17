import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyZeroCostReadiness,
  inspectZeroCostProviderReadiness,
} from '../src/augmentio/zero-cost-readiness.js';

test('zero-cost readiness separates technical degradation from policy protection', () => {
  assert.deepEqual(
    classifyZeroCostReadiness({ minimum: 2, healthyCount: 0, authorizedCount: 0 }),
    { status: 'DEGRADED', reason: 'NO_HEALTHY_PROVIDER', minimum: 2 },
  );
  assert.deepEqual(
    classifyZeroCostReadiness({ minimum: 2, healthyCount: 4, authorizedCount: 0 }),
    { status: 'SAFE_IDLE', reason: 'ZERO_EURO_POLICY_PROTECTED', minimum: 2 },
  );
  assert.deepEqual(
    classifyZeroCostReadiness({ minimum: 2, healthyCount: 4, authorizedCount: 1 }),
    { status: 'LIMITED', reason: 'ZERO_EURO_QUORUM_INSUFFICIENT', minimum: 2 },
  );
  assert.deepEqual(
    classifyZeroCostReadiness({ minimum: 2, healthyCount: 4, authorizedCount: 2 }),
    { status: 'ONLINE', reason: 'ZERO_EURO_QUORUM_READY', minimum: 2 },
  );
});

test('default Workers AI adapters are discovered by capability during readiness checks', async () => {
  const readiness = await inspectZeroCostProviderReadiness({
    AI: { run: async () => ({ response: 'unused in health check' }) },
  }, {
    capability: 'GENERAL',
    minimum: 1,
    refreshHealth: true,
  });

  assert.equal(readiness.provider_count, 3);
  assert.equal(readiness.healthy_provider_count, 3);
  assert.equal(readiness.authorized_zero_cost_count, 0);
  assert.equal(readiness.status, 'SAFE_IDLE');
  assert.equal(readiness.reason, 'ZERO_EURO_POLICY_PROTECTED');
});
