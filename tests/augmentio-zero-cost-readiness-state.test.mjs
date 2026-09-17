import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyZeroCostReadiness } from '../src/augmentio/zero-cost-readiness.js';

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
