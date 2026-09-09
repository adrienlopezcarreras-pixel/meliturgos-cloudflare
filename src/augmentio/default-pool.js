import { ProviderPool } from './provider-pool.js';
import { createWorkersAIAdapter } from './workers-ai-adapter.js';
import { standardRegistry } from '../models/ModelRegistry.js';

export function createDefaultAugmentioPool(env, { registry = standardRegistry } = {}) {
  const adapters = registry.list()
    .filter((model) => model.enabled !== false)
    .filter((model) => model.provider === 'workers-ai')
    .map((model) => createWorkersAIAdapter({
      env,
      id: `workers-ai:${model.id}`,
      modelId: model.model_id || model.id,
      capabilities: model.capabilities || ['GENERAL'],
      priority: model.priority || 0,
      // Fail closed: a missing/unknown cost must remain unknown so the
      // ZeroEuroGovernor can reject it instead of silently treating it as free.
      estimatedCost: model.cost ?? null,
      concurrency: model.concurrency || 2,
    }));

  return new ProviderPool(adapters);
}
