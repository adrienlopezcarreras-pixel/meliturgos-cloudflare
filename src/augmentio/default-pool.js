import { ProviderPool } from './provider-pool.js';
import { createWorkersAIAdapter } from './workers-ai-adapter.js';
import { standardRegistry } from '../models/ModelRegistry.js';

function testOnlyVerifiedFreeProvenance() {
  // CI/unit tests use mocked providers and make no external billable calls.
  // Keep this proof impossible to activate from the Cloudflare Worker env:
  // it is read only from the local Node process that runs the test suite.
  if (typeof process === 'undefined' || process?.env?.MEL_TEST_VERIFIED_ZERO_COST_PROVIDERS !== '1') return null;
  return { verified: true, addedCost: 0, source: 'node-test-fixture-no-external-billing' };
}

export function createDefaultAugmentioPool(env, { registry = standardRegistry } = {}) {
  const testProvenance = testOnlyVerifiedFreeProvenance();
  const adapters = registry.list()
    .filter((model) => model.enabled !== false)
    .filter((model) => model.provider === 'workers-ai')
    .map((model) => createWorkersAIAdapter({
      env,
      id: `workers-ai:${model.id}`,
      modelId: model.model_id || model.id,
      capabilities: model.capabilities || ['GENERAL'],
      priority: model.priority || 0,
      // Production stays fail closed: registry cost=0 is not sufficient proof.
      // Only explicit runtime provenance or the Node-only test fixture can
      // satisfy the ZeroEuroGovernor.
      estimatedCost: model.cost ?? null,
      costProvenance: model.costProvenance ?? model.cost_provenance ?? testProvenance,
      concurrency: model.concurrency || 2,
    }));

  return new ProviderPool(adapters);
}
