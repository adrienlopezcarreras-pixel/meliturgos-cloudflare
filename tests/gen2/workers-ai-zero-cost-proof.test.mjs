import test from 'node:test';
import assert from 'node:assert/strict';

import { createDefaultAugmentioPool } from '../../src/augmentio/default-pool.js';
import { ZeroEuroGovernor } from '../../src/augmentio/zero-euro-governor.js';
import {
  WORKERS_AI_ZERO_COST_PROOF_SCHEMA,
  WORKERS_AI_ZERO_COST_PRICING_POLICY,
  WORKERS_FREE_STATIC_ASSET_LIMIT_KEY,
  WORKERS_FREE_STATIC_ASSET_LIMIT,
  WORKERS_FREE_AI_ALLOCATION_NEURONS,
  WORKERS_AI_ZERO_COST_PROOF_MAX_AGE_MS,
  workersAiRuntimeZeroCostProvenance,
} from '../../src/augmentio/workers-ai-zero-cost-proof.js';

function iso(ms) {
  return new Date(ms).toISOString();
}

function validProof(now, models = ['@cf/zai-org/glm-4.7-flash']) {
  return {
    schema: WORKERS_AI_ZERO_COST_PROOF_SCHEMA,
    provider: 'workers-ai',
    account_plan: 'WORKERS_FREE',
    billing_path: 'direct-workers-ai-binding',
    pricing_policy: WORKERS_AI_ZERO_COST_PRICING_POLICY,
    free_allocation_neurons_per_day: WORKERS_FREE_AI_ALLOCATION_NEURONS,
    free_overage_behavior: 'FAIL_NOT_BILL',
    plan_evidence: {
      source: 'cloudflare-account-entitlements-api',
      account_type: 'standard',
      entitlement_key: WORKERS_FREE_STATIC_ASSET_LIMIT_KEY,
      entitlement_value: WORKERS_FREE_STATIC_ASSET_LIMIT,
      workers_free_reference_value: WORKERS_FREE_STATIC_ASSET_LIMIT,
    },
    models,
    verified_at: iso(now - 60_000),
    expires_at: iso(now + 20 * 60_000),
  };
}

test('valid short-lived Workers Free proof yields exact model-bound Zero-Euro provenance', () => {
  const now = Date.now();
  const model = '@cf/zai-org/glm-4.7-flash';
  const adapterId = `workers-ai:${model}`;
  const provenance = workersAiRuntimeZeroCostProvenance({
    MEL_WORKERS_AI_ZERO_COST_PROOF_JSON: JSON.stringify(validProof(now, [model])),
  }, { adapterId, modelId: model, now });

  assert.ok(provenance);
  assert.equal(provenance.verified, true);
  assert.equal(provenance.addedCost, 0);
  assert.equal(provenance.authorization.adapter_id, adapterId);
  assert.equal(provenance.authorization.provider, 'workers-ai');
  assert.equal(provenance.authorization.model, model);
  assert.equal(provenance.evidence.account_plan, 'WORKERS_FREE');
});

test('missing, malformed and stale runtime proof all fail closed', () => {
  const now = Date.now();
  const model = '@cf/zai-org/glm-4.7-flash';
  const adapterId = `workers-ai:${model}`;

  assert.equal(workersAiRuntimeZeroCostProvenance({}, { adapterId, modelId: model, now }), null);
  assert.equal(workersAiRuntimeZeroCostProvenance({
    MEL_WORKERS_AI_ZERO_COST_PROOF_JSON: '{not-json',
  }, { adapterId, modelId: model, now }), null);

  const expired = validProof(now, [model]);
  expired.verified_at = iso(now - 30 * 60_000);
  expired.expires_at = iso(now - 1);
  assert.equal(workersAiRuntimeZeroCostProvenance({
    MEL_WORKERS_AI_ZERO_COST_PROOF_JSON: JSON.stringify(expired),
  }, { adapterId, modelId: model, now }), null);
});

test('proof longer than one hour or issued materially in the future is rejected', () => {
  const now = Date.now();
  const model = '@cf/zai-org/glm-4.7-flash';
  const adapterId = `workers-ai:${model}`;

  const tooLong = validProof(now, [model]);
  tooLong.verified_at = iso(now);
  tooLong.expires_at = iso(now + WORKERS_AI_ZERO_COST_PROOF_MAX_AGE_MS + 1);
  assert.equal(workersAiRuntimeZeroCostProvenance({
    MEL_WORKERS_AI_ZERO_COST_PROOF_JSON: JSON.stringify(tooLong),
  }, { adapterId, modelId: model, now }), null);

  const future = validProof(now, [model]);
  future.verified_at = iso(now + 61_000);
  future.expires_at = iso(now + 10 * 60_000);
  assert.equal(workersAiRuntimeZeroCostProvenance({
    MEL_WORKERS_AI_ZERO_COST_PROOF_JSON: JSON.stringify(future),
  }, { adapterId, modelId: model, now }), null);
});

test('proof is rejected when plan evidence, pricing semantics or model binding do not match', () => {
  const now = Date.now();
  const model = '@cf/zai-org/glm-4.7-flash';
  const adapterId = `workers-ai:${model}`;

  for (const mutate of [
    proof => { proof.account_plan = 'WORKERS_PAID'; },
    proof => { proof.billing_path = 'ai-gateway-unified-billing'; },
    proof => { proof.free_overage_behavior = 'BILL'; },
    proof => { proof.plan_evidence.account_type = 'enterprise'; },
    proof => { proof.plan_evidence.entitlement_value = 100000; },
    proof => { proof.models = ['@cf/meta/llama-3.3-70b-instruct-fp8-fast']; },
  ]) {
    const proof = validProof(now, [model]);
    mutate(proof);
    assert.equal(workersAiRuntimeZeroCostProvenance({
      MEL_WORKERS_AI_ZERO_COST_PROOF_JSON: JSON.stringify(proof),
    }, { adapterId, modelId: model, now }), null);
  }
});

test('default provider pool converts a valid runtime proof into governor authorization', () => {
  const now = Date.now();
  const models = [
    '@cf/zai-org/glm-4.7-flash',
    '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
  ];
  const env = {
    AI: { run: async () => ({ response: 'ok' }) },
    MEL_WORKERS_AI_ZERO_COST_PROOF_JSON: JSON.stringify(validProof(now, models)),
  };
  const pool = createDefaultAugmentioPool(env);
  const governor = new ZeroEuroGovernor();
  const candidates = pool.list({ capability: 'GENERAL' }).filter(row => models.includes(row.modelId));

  assert.equal(candidates.length, 2);
  assert.ok(candidates.every(candidate => governor.evaluate(candidate).allowed === true));
  assert.ok(candidates.every(candidate => candidate.costProvenance?.evidence?.account_plan === 'WORKERS_FREE'));
});

test('default provider pool remains blocked when no runtime proof is configured', () => {
  const previous = process.env.MEL_TEST_VERIFIED_ZERO_COST_PROVIDERS;
  delete process.env.MEL_TEST_VERIFIED_ZERO_COST_PROVIDERS;
  try {
    const pool = createDefaultAugmentioPool({
      AI: { run: async () => ({ response: 'must-not-run' }) },
    });
    const governor = new ZeroEuroGovernor();
    const candidates = pool.list({ capability: 'GENERAL' });
    assert.ok(candidates.length >= 1);
    assert.ok(candidates.every(candidate => governor.evaluate(candidate).allowed === false));
  } finally {
    if (previous !== undefined) process.env.MEL_TEST_VERIFIED_ZERO_COST_PROVIDERS = previous;
  }
});
