import test from 'node:test';
import assert from 'node:assert/strict';
import { safeCouncilEvidence } from '../src/teachers/public-teacher-api.js';

test('public Teacher evidence exposes only the verified zero-added-cost Council policy', () => {
  const evidence = safeCouncilEvidence({
    requested_by: 'mel-autonomy',
    plan_json: {
      preflight: {
        council: {
          status: 'COMPLETE',
          context: { budget_policy: 'ZERO_ADDED_COST_FAIL_CLOSED' },
          providers_attempted: ['workers-ai:model-a'],
          providers_succeeded: ['workers-ai:model-a'],
          responses: [{
            member: 'workers-ai:model-a',
            answer: {
              provider_id: 'workers-ai:model-a',
              role: 'ARCHITECTURE_REUSE',
              provenance: { provider: 'workers-ai', model: '@cf/example/model-a' },
            },
          }],
          required_roles_attempted: ['ARCHITECTURE_REUSE','SECURITY_GOVERNANCE','TESTS_EVIDENCE','PRODUCT_INTEGRATION'],
          required_roles_succeeded: ['ARCHITECTURE_REUSE','SECURITY_GOVERNANCE','TESTS_EVIDENCE','PRODUCT_INTEGRATION'],
          all_required_roles_satisfied: true,
          synthesis: {
            status: 'COMPLETE',
            coordinator: 'MEL',
            provider_id: 'workers-ai:model-a',
            provenance: { provider: 'workers-ai', model: '@cf/example/model-a' },
            text: 'private synthesis must not leak',
          },
          teacher_required: true,
        },
      },
    },
  });

  assert.equal(evidence?.budget_policy, 'ZERO_ADDED_COST_FAIL_CLOSED');
  assert.equal(evidence?.content_exposed, false);
  assert.equal(JSON.stringify(evidence).includes('private synthesis'), false);
});

test('public Teacher evidence fails closed when the Council budget policy is absent or unrecognized', () => {
  const base = {
    requested_by: 'mel-autonomy',
    plan_json: {
      preflight: {
        council: {
          status: 'COMPLETE',
          context: {},
          responses: [],
          providers_attempted: [],
          providers_succeeded: [],
          required_roles_attempted: [],
          required_roles_succeeded: [],
          all_required_roles_satisfied: false,
          synthesis: null,
          teacher_required: true,
        },
      },
    },
  };
  assert.equal(safeCouncilEvidence(base)?.budget_policy, null);
  const unknown = structuredClone(base);
  unknown.plan_json.preflight.council.context.budget_policy = 'UNKNOWN_COST_POLICY';
  assert.equal(safeCouncilEvidence(unknown)?.budget_policy, null);
});
