import { requireValue } from '../core/contracts.js';

export class ModelRegistry {
  constructor(models = []) {
    this.models = new Map();
    this.primaryByCapability = new Map();
    for (const model of models) this.register(model);
  }

  register(model) {
    requireValue(model?.id && Array.isArray(model.capabilities), 'INVALID_MODEL');
    const record = {
      provider: 'workers-ai',
      model_id: model.id,
      context: null,
      tools: false,
      vision: false,
      audio: false,
      structured: false,
      cost: null,
      latency: null,
      health: 'UNKNOWN',
      enabled: true,
      priority: 0,
      ...model,
      capabilities: [...model.capabilities],
    };
    this.models.set(model.id, structuredClone(record));
    return this.get(model.id);
  }

  get(id) {
    const model = this.models.get(id);
    return model ? structuredClone(model) : null;
  }

  list() {
    return [...this.models.values()].map(model => structuredClone(model));
  }

  // Compatibility alias used by the orchestration layer and older callers.
  getAll() {
    return this.list();
  }

  getCapabilities() {
    return [...new Set(this.list().flatMap(model => model.capabilities || []))].sort();
  }

  update(id, patch = {}) {
    const model = this.get(id);
    requireValue(model, 'MODEL_NOT_FOUND', 404);
    return this.register({ ...model, ...patch, id });
  }

  disable(id) {
    return this.update(id, { enabled: false });
  }

  health(id) {
    return this.get(id)?.health || 'UNKNOWN';
  }

  modelsByCapability(capability) {
    const wanted = String(capability || '').toUpperCase();
    return this.list()
      .filter(model => model.enabled && model.health !== 'UNAVAILABLE')
      .filter(model => (model.capabilities || []).some(cap => String(cap).toUpperCase() === wanted))
      .sort((a, b) => (b.priority || 0) - (a.priority || 0));
  }

  getByCapabilities(caps, limit = 10) {
    const wanted = (Array.isArray(caps) ? caps : [caps]).map(cap => String(cap).toUpperCase());
    return this.list()
      .filter(model => model.enabled && model.health !== 'UNAVAILABLE')
      .filter(model => wanted.every(cap => (model.capabilities || []).some(value => String(value).toUpperCase() === cap)))
      .sort((a, b) => (b.priority || 0) - (a.priority || 0))
      .slice(0, limit);
  }

  setPrimary(capability, modelId) {
    const model = this.get(modelId);
    requireValue(model, 'MODEL_NOT_FOUND', 404);
    const wanted = String(capability || '').toUpperCase();
    requireValue((model.capabilities || []).some(cap => String(cap).toUpperCase() === wanted), 'MODEL_CAPABILITY_MISMATCH', 409);
    this.primaryByCapability.set(wanted, modelId);
    return model;
  }

  getBestByCapability(capability) {
    const wanted = String(capability || '').toUpperCase();
    const primaryId = this.primaryByCapability.get(wanted);
    if (primaryId) {
      const primary = this.get(primaryId);
      if (primary?.enabled && primary.health !== 'UNAVAILABLE') return primary;
    }
    return this.modelsByCapability(wanted)[0] || null;
  }

  getFallbackChain(primaryId, limit = 2) {
    const primary = this.get(primaryId);
    const capabilitySet = new Set((primary?.capabilities || []).map(cap => String(cap).toUpperCase()));
    const candidates = this.list()
      .filter(model => model.id !== primaryId && model.enabled && model.health !== 'UNAVAILABLE')
      .map(model => ({
        model,
        overlap: (model.capabilities || []).reduce((score, cap) => score + (capabilitySet.has(String(cap).toUpperCase()) ? 1 : 0), 0),
      }))
      .sort((a, b) => b.overlap - a.overlap || (b.model.priority || 0) - (a.model.priority || 0))
      .map(entry => entry.model);
    return candidates.slice(0, Math.max(0, Number(limit) || 0));
  }

  size() {
    return this.models.size;
  }
}

// Configured IDs only. Availability deliberately remains UNKNOWN until a real successful call.
export const standardRegistry = new ModelRegistry([
  { id: '@cf/zai-org/glm-4.7-flash', capabilities: ['GENERAL', 'FAST', 'STEERABLE', 'FALLBACK'], priority: 30, cost: 0 },
  { id: '@cf/meta/llama-3.3-70b-instruct-fp8-fast', capabilities: ['GENERAL', 'REASONING', 'CODE', 'FALLBACK'], priority: 20, cost: 0 },
  { id: '@cf/google/gemma-3-12b-it', capabilities: ['GENERAL', 'CODE', 'FALLBACK'], priority: 10, cost: 0 },
  {
    id: 'ninjachat-default',
    provider: 'ninjachat',
    model_id: 'ninjachat-default',
    capabilities: ['GENERAL', 'REASONING', 'STEERABLE', 'FALLBACK'],
    priority: -100,
    cost: null,
    health: 'UNKNOWN',
    enabled: true,
    role_general: true,
    role_reasoning: true,
    role_steerable: true,
    fallback_final: true,
  },
]);
