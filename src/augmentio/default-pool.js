import { ProviderPool } from './provider-pool.js';
import { createWorkersAIAdapter } from './workers-ai-adapter.js';
import { ZERO_EURO_POLICY } from './zero-euro-governor.js';
import { standardRegistry } from '../models/ModelRegistry.js';
import { workersAiRuntimeZeroCostProvenance } from './workers-ai-zero-cost-proof.js';

function testOnlyVerifiedFreeProvenance({ adapterId, modelId }) {
  // CI/unit tests use mocked providers and make no external billable calls.
  // Keep this proof impossible to activate from the Cloudflare Worker env:
  // it is read only from the local Node process that runs the test suite.
  if (typeof process === 'undefined' || process?.env?.MEL_TEST_VERIFIED_ZERO_COST_PROVIDERS !== '1') return null;
  return {
    verified: true,
    addedCost: 0,
    source: 'node-test-fixture-no-external-billing',
    authorization: {
      approved: true,
      policy: ZERO_EURO_POLICY,
      authority: 'mel-node-test-runner',
      adapter_id: adapterId,
      provider: 'workers-ai',
      model: modelId,
    },
  };
}

export function createDefaultAugmentioPool(env, { registry = standardRegistry } = {}) {
  const adapters = registry.list()
    .filter((model) => model.enabled !== false)
    .filter((model) => model.provider === 'workers-ai')
    .map((model) => {
      const adapterId = `workers-ai:${model.id}`;
      const modelId = model.model_id || model.id;
      return createWorkersAIAdapter({
        env,
        id: adapterId,
        modelId,
        capabilities: model.capabilities || ['GENERAL'],
        priority: model.priority || 0,
        // Production stays fail closed: registry cost=0 is not sufficient proof.
        // Only explicitly authorized runtime provenance or the Node-only test
        // fixture bound to this exact adapter can satisfy the governor.
        estimatedCost: model.cost ?? null,
        costProvenance: model.costProvenance
          ?? model.cost_provenance
          ?? workersAiRuntimeZeroCostProvenance(env, { adapterId, modelId })
          ?? testOnlyVerifiedFreeProvenance({ adapterId, modelId }),
        concurrency: model.concurrency || 2,
      });
    });

  return new ProviderPool(adapters);
}
