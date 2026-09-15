import test from 'node:test';
import assert from 'node:assert/strict';
import { ProviderPool } from '../src/augmentio/provider-pool.js';
import { ZERO_EURO_POLICY } from '../src/augmentio/zero-euro-governor.js';
import { prepareDevelopmentRequest, authorizeDevelopmentPlan } from '../src/evolution/development-preflight.js';
import { createTeacherReviewRequest } from '../src/teachers/teacher-request.js';

const verifiedFree = id => Object.freeze({
  verified: true,
  addedCost: 0,
  source: 'test-fixture-no-external-billing',
  authorization: Object.freeze({
    approved: true,
    policy: ZERO_EURO_POLICY,
    authority: 'degraded-zero-cost-council-test',
    adapter_id: id,
    provider: 'test',
    model: id,
  }),
});

const provider = id => ({
  id,
  providerId: 'test',
  modelId: id,
  capabilities: ['GENERAL'],
  estimatedCost: 0,
  costProvenance: verifiedFree(id),
  healthStatus: 'HEALTHY',
  enabled: true,
  health: async () => 'HEALTHY',
  invoke: async () => ({ text: `unused ${id}`, provenance: { provider: 'test', model: id } }),
});

test('too few zero-cost providers escalates to Teacher instead of exhausting autonomy retries', async () => {
  const pool = new ProviderPool([provider('only-free-provider')]);
  const preflight = await prepareDevelopmentRequest({
    env: {},
    goal: 'Continuer un travail candidate sans dépense ajoutée',
    context: { target_sha: '0123456789abcdef0123456789abcdef01234567' },
    pool,
  });

  assert.equal(preflight.stage, 'AI_STATE_OF_PLAY_COMPLETE');
  assert.equal(preflight.degraded, true);
  assert.equal(preflight.code_inspection_allowed, true);
  assert.equal(preflight.code_generation_allowed, false);
  assert.equal(preflight.council.status, 'DEGRADED');
  assert.equal(preflight.council.degraded_reason, 'NOT_ENOUGH_ZERO_COST_PROVIDERS');
  assert.equal(preflight.council.teacher_required, true);
  assert.equal(preflight.council.development_allowed, false);
  assert.deepEqual(preflight.council.eligible_providers, ['only-free-provider']);

  const inspection = {
    status: 'COMPLETE',
    evidence: [{ kind: 'CODE_READ', path: 'src/evolution/autonomy-runtime.js' }],
  };

  assert.throws(
    () => authorizeDevelopmentPlan(preflight, inspection),
    error => error.code === 'TEACHER_REVIEW_REQUIRED_FOR_DEGRADED_COUNCIL'
  );

  const request = createTeacherReviewRequest({
    goal: preflight.goal,
    council: preflight.council,
    inspection,
    spec: { candidate_only: true, zero_added_cost: true },
    candidate: {
      repository: 'adrienlopezcarreras-pixel/meliturgos-cloudflare',
      branch: 'candidate/mel-clean-autonomy',
      sha: '0123456789abcdef0123456789abcdef01234567',
    },
    provenance: {
      target_sha: '0123456789abcdef0123456789abcdef01234567',
    },
  });

  assert.equal(request.stage, 'TEACHER_REVIEW_REQUIRED');
  assert.equal(request.council.status, 'DEGRADED');
  assert.equal(request.council.degraded_reason, 'NOT_ENOUGH_ZERO_COST_PROVIDERS');
});
