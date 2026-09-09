import test from 'node:test';
import assert from 'node:assert/strict';
import { ProviderPool } from '../src/augmentio/provider-pool.js';
import { prepareDevelopmentRequest, authorizeDevelopmentPlan } from '../src/evolution/development-preflight.js';

const provider = id => ({
  id,
  providerId: 'test',
  modelId: id,
  capabilities: ['GENERAL'],
  estimatedCost: 0,
  healthStatus: 'HEALTHY',
  enabled: true,
  health: async () => 'HEALTHY',
  invoke: async () => ({ text: `état des lieux ${id}`, provenance: { provider: 'test', model: id } })
});

test('development preflight consults multiple AIs before allowing any code generation', async () => {
  const pool = new ProviderPool([provider('a'), provider('b')]);
  const preflight = await prepareDevelopmentRequest({ env: {}, goal: 'Créer une nouvelle compétence calendrier', pool });
  assert.equal(preflight.stage, 'AI_STATE_OF_PLAY_COMPLETE');
  assert.equal(preflight.council.responses.length, 2);
  assert.equal(preflight.code_inspection_allowed, true);
  assert.equal(preflight.code_generation_allowed, false);
  assert.equal(preflight.development_allowed, false);
  assert.equal(preflight.next, 'INSPECT_EXISTING_CODE_AND_REUSE_BEFORE_SPEC');
});

test('development plan remains blocked until code inspection evidence exists', async () => {
  const pool = new ProviderPool([provider('a'), provider('b')]);
  const preflight = await prepareDevelopmentRequest({ env: {}, goal: 'Ajouter une compétence', pool });
  assert.throws(() => authorizeDevelopmentPlan(preflight, null), e => e.code === 'CODE_INSPECTION_REQUIRED');
  const plan = authorizeDevelopmentPlan(preflight, { status: 'COMPLETE', evidence: [{ path: 'src/router.js', line: 1 }] });
  assert.equal(plan.stage, 'DEVELOPMENT_PLAN_AUTHORIZED');
  assert.equal(plan.code_generation_allowed, true);
});
