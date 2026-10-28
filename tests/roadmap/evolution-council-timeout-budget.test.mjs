import test from 'node:test';
import assert from 'node:assert/strict';
import { PROVIDER_CALL_TIMEOUT_MS, COUNCIL_REVIEW_MAX_MS } from '../../src/teachers/augmentio-council.js';
import { providerDeferral } from '../../src/evolution/autonomy-runtime-core.js';

test('MAX Council timeout correction preserves all review and retry safety ceilings', () => {
  // Measured production D1 failure histogram: 81 Council provider timeouts,
  // each at the former hard cap of 12000 ms.
  assert.equal(PROVIDER_CALL_TIMEOUT_MS, 20_000);
  assert.equal(COUNCIL_REVIEW_MAX_MS, 58_000);
  assert.ok(COUNCIL_REVIEW_MAX_MS < 60_000);
  assert.ok(PROVIDER_CALL_TIMEOUT_MS * 2 < COUNCIL_REVIEW_MAX_MS);
  const now = 1_792_800_000_000;
  for (const error of ['COUNCIL_PROVIDER_COOLDOWN_PENDING','COUNCIL_INSUFFICIENT_RESPONSES','COUNCIL_NOT_ENOUGH_ZERO_COST_PROVIDERS']) {
    const deferral = providerDeferral(error, now);
    assert.equal(deferral.code, error);
    assert.equal(deferral.retry_after, now + 5 * 60_000);
  }
});
