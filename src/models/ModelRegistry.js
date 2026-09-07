/**
 * ModelRegistry.js
 * 
 * Fonctionnalités Génériques:
 * - Enregistrement de modèles AI Cloudflare
 * - Metadata: pricing, capabilities, availability, latency
 * - Recherche par capabilities, pricing, tags
 * - Fallback orchestration
 * 
 * Usage:
 * ```javascript
 * const registry = new ModelRegistry();
 * 
 * // Register models
 * registry.register({
 *   id: "@cf/moonshotai/kimi-k2.7-code",
 *   name: "Kimi K2.7 Code",
 *   provider: "@cf/moonshotai",
 *   capability: "code",
 *   pricing: { input: "$0.001 per 1M tokens", output: "$0.003 per 1M tokens" },
 *   tags: ["code", "kimi", "moonshot"],
 *   metadata: { max_tokens: 8192, context_window: 131072 }
 * });
 * 
 * // Query & Fallback Chain
 * const primary = registry.getPrimaryByCapability("code");
 * const fallbacks = registry.getFallbacks(primary, 2);
 * ```
 */

export class ModelRegistry {
  constructor() {
    // Map[model_id] = ModelMetadata
    this.models = new Map();
    // Map[capability] = Set[model_ids]
    this.capabilityIndex = new Map();
  }

  /**
   * Enregistre un modèle Cloudflare Workers AI
   */
  register(metadata) {
    const { id, name, provider, capabilities, pricing, tags, metadata: extendedMeta } = metadata;

    if (!id) throw new Error("Model ID required");
    if (this.models.has(id)) {
      console.warn(`[ModelRegistry] Model ${id} already registered, updating`);
    }

    const model = {
      id,
      name: name || id,
      provider: provider || "unknown",
      capabilities: capabilities ? (Array.isArray(capabilities) ? capabilities : [capabilities]) : [],
      pricing: {
        input: pricing?.input || "unknown",
        output: pricing?.output || "unknown",
        estimated_cost_per_input_usd: pricing?.estimated_cost_per_input_usd || 0,
        estimated_cost_per_output_usd: pricing?.estimated_cost_per_output_usd || 0
      },
      tags: tags || [],
      extended: extendedMeta || {},
      registered_at: Date.now(),
      status: "registered"
    };

    this.models.set(id, model);

    // Update capability index
    for (const capability of model.capabilities) {
      if (!this.capabilityIndex.has(capability)) {
        this.capabilityIndex.set(capability, new Set());
      }
      this.capabilityIndex.get(capability).add(id);
    }

    console.log(`[ModelRegistry] Registered: ${name} (${id})`);
    return model;
  }

  /**
   * Récupère un modèle par ID
   */
  get(id) {
    return this.models.get(id);
  }

  /**
   * Récupère tous les modèles enregistrés
   */
  getAll() {
    return Array.from(this.models.values());
  }

  /**
   * Recherche par capabilities
   */
  getByCapabilities(capabilities, limit = 10) {
    const caps = Array.isArray(capabilities) ? capabilities : [capabilities];
    const candidates = new Set();

    for (const cap of caps) {
      const models = this.capabilityIndex.get(cap);
      if (models) {
        for (const id of models) {
          candidates.add(id);
        }
      }
    }

    const results = Array.from(candidates)
      .map(id => this.models.get(id))
      .filter(m => m !== undefined)
      .slice(0, limit);

    return results;
  }

  /**
   * Récupère le meilleur modèle pour une capability donnée
   */
  getBestByCapability(capability) {
    const models = this.getByCapabilities(capability);
    if (models.length === 0) return null;
    return models[0]; // Plus simples: retourner le premier
  }

  /**
   * Définit le modèle primaire pour une capability
   */
  setPrimary(capability, modelId) {
    const model = this.get(modelId);
    if (!model) throw new Error(`Model ${modelId} not found`);
    
    // Remove old primary
    for (const [cap, set] of this.capabilityIndex.entries()) {
      if (set.has(capability + "_primary")) {
        set.delete(capability + "_primary");
      }
    }

    // Add new primary
    this._addToIndex(modelId, capability + "_primary");

    console.log(`[ModelRegistry] Primary for ${capability} set to: ${modelId}`);
    return model;
  }

  /**
   * Récupère la chaîne de fallback pour un modèle primaire
   */
  getFallbackChain(primaryId, maxCount = 2) {
    const primaryModel = this.get(primaryId);
    if (!primaryModel) {
      throw new Error(`Primary model ${primaryId} not found`);
    }

    const primaryCapability = primaryModel.capabilities[0];
    const otherModels = this.getByCapabilities(primaryCapability).filter(m => m.id !== primaryId);

    console.log(`[ModelRegistry] Fallback chain for ${primaryId} (${maxCount} models):`);
    for (let i = 0; i < Math.min(maxCount, otherModels.length); i++) {
      console.log(`  ${i + 1}. ${otherModels[i].name} (${otherModels[i].id})`);
    }

    return otherModels.slice(0, maxCount);
  }

  /**
   * Récupère toutes les capabilities supportées
   */
  getCapabilities() {
    return Array.from(this.capabilityIndex.keys()).filter(cap => !cap.includes("_primary"));
  }

  /**
   * Nettoie tous les modèles
   */
  clear() {
    this.models.clear();
    this.capabilityIndex.clear();
    console.log(`[ModelRegistry] Registry cleared`);
  }

  /**
   * Compte le nombre de modèles enregistrés
   */
  size() {
    return this.models.size;
  }

  // Internal helper
  _addToIndex(modelId, ability) {
    if (!this.capabilityIndex.has(ability)) {
      this.capabilityIndex.set(ability, new Set());
    }
    this.capabilityIndex.get(ability).add(modelId);
  }
}

// Pre-register standard models if needed
export const standardRegistry = (function() {
  const registry = new ModelRegistry();

  // Register Kimi K2.7 (code model)
  registry.register({
    id: "@cf/moonshotai/kimi-k2.7-code",
    name: "Kimi K2.7 Code",
    provider: "@cf/moonshotai",
    capabilities: ["code", "reasoning"],
    pricing: {
      input: "$0.010 per 1M tokens",
      output: "$0.030 per 1M tokens",
      estimated_cost_per_input_usd: 0.010 / 1_000_000,
      estimated_cost_per_output_usd: 0.030 / 1_000_000
    },
    tags: ["code", "kimi", "moonshot", "high-quality"],
    metadata: { max_tokens: 8192, context_window: 131072 }
  });

  // Register GLM-4.7 (general chat)
  registry.register({
    id: "@cf/zai-org/glm-4.7-flash",
    name: "GLM-4.7 Flash",
    provider: "@cf/zai-org",
    capabilities: ["chat", "reasoning", "general"],
    pricing: {
      input: "$0.0001 per 1M tokens",  // Flash tier
      output: "$0.0001 per 1M tokens",
      estimated_cost_per_input_usd: 0.0001 / 1_000_000,
      estimated_cost_per_output_usd: 0.0001 / 1_000_000
    },
    tags: ["chat", "glm", "fast", "budget-friendly"],
    metadata: { max_tokens: 8192, context_window: 8192 }
  });

  // Register Gemma-3 (universal fallback)
  registry.register({
    id: "@cf/google/gemma-3-12b-it",
    name: "Gemma-3 12B Instruct",
    provider: "@cf/google",
    capabilities: ["chat", "code", "reasoning", "general"],
    pricing: {
      input: "$0.060 per 1M tokens",
      output: "$0.060 per 1M tokens",
      estimated_cost_per_input_usd: 0.060 / 1_000_000,
      estimated_cost_per_output_usd: 0.060 / 1_000_000
    },
    tags: ["chat", "gemma", "google", "medium-quality", "fallback"],
    metadata: { max_tokens: 8192, context_window: 8192 }
  });

  return registry;
})();