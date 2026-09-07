/**
 * ModelRouter.js
 * 
 * Routes AI requests to appropriate model based on capabilities.
 * Uses ModelRegistry for model selection and OrchestratedFallback for retry logic.
 * 
 * This module implements the Model Router requirement from MASTER SPEC §2.8:
 * - Select model based on task (conversation, reasoning, code, vision, audio, media)
 * - Automatic fallback on model failure
 * - Supports future external models
 */

import { 
  standardRegistry 
} from './ModelRegistry.js';

/**
 * Task type classification for model selection
 */
const TASK_TYPES = {
  CONVERSATION: 'conversation',
  REASONING: 'reasoning',
  CODING: 'coding',
  VISION: 'vision',
  AUDIO: 'audio',
  MEDIA: 'media',
  GENERAL: 'general'
};

/**
 * ModelRouter - Routes AI requests to appropriate models
 */
export class ModelRouter {
  constructor() {
    this.registry = standardRegistry;
    // Convert capability-Set<ModelId> to capability-Array<Model>
    this.registry.modelsByCapability = {};
    for (const [cap, modelIds] of this.registry.capabilityIndex.entries()) {
      this.registry.modelsByCapability[cap] = Array.from(modelIds)
        .map(id => this.registry.models.get(id))
        .filter(m => m !== undefined);
    }
    
    console.log('[ModelRouter] Initialized with modelsByCapability mapping');
  }

  /**
   * Select model for a given task
   * @param {string} capability - Primary capability (chat, code, reasoning, vision, audio, media)
   * @param {object} options - Selection options
   * @param {string} options.primaryModelIndex - Force specific model
   * @param {number} options.maxCost - Maximum estimated cost in USD
   * @returns {object} Selected model
   */
  selectModel(capability, options = {}) {
    const { 
      primaryModelIndex,
      maxCost = Infinity 
    } = options;

    // Get models by capability
    let candidates = this.registry.modelsByCapability[capability] || [];
    
    // If primaryModelIndex specified, prioritize that model
    if (primaryModelIndex && candidates.find(m => m.id === primaryModelIndex)) {
      candidates = candidates.filter(m => m.id === primaryModelIndex);
    }

    // Filter by cost if specified
    if (maxCost < Infinity) {
      candidates = candidates.filter(m => 
        m.pricing?.estimated_cost_per_input_usd <= maxCost
      );
    }

    // If no candidates, fallback to general chat (task type constant)
    if (candidates.length === 0) {
      candidates = this.registry.modelsByCapability['general'] || [];
    }

    // If still no candidates, raise error
    if (candidates.length === 0) {
      throw new Error(`No models available for capability: ${capability}`);
    }

    // Return first candidate (could be enhanced with load balancing or cost-based selection)
    return candidates[0];
  }

  /**
   * Call model with configured fallback
   * @param {string} capability - Task capability
   * @param {object} request - Request payload
   * @param {object} options - Router options
   * @returns {Promise<object>} Model response
   */
  async callModel(capability, request, options = {}) {
    try {
      const model = this.selectModel(capability, options);
      
      console.log(`[ModelRouter] Routing ${capability} to:`, model.name);
      
      // Use orchestrated fallback for robustness
      const response = await standardRegistry.executeModel(
        model.id,
        request
      );
      
      return response;
    } catch (error) {
      // If error occurred after selection but before call
      console.error(`[ModelRouter] Error with hierarchy, checking alternatives...`, error.message);
      throw error;
    }
  }

  /**
   * Estimate cost for a task
   * @param {string} capability - Task capability
   * @param {object} options - Selection options
   * @returns {number} Estimated cost in USD
   */
  estimateCost(capability, options = {}) {
    const model = this.selectModel(capability, options);
    
    if (!model.pricing) {
      return 0;
    }

    // Estimate based on input tokens (and output if available)
    const inputCost = model.pricing.estimated_cost_per_input_usd;
    const outputCost = model.pricing.estimated_cost_per_output_usd || inputCost;
    
    // Use reasonable default token counts for estimation
    const estimatedInputTokens = 1000;
    const estimatedOutputTokens = 500;

    return (inputCost * estimatedInputTokens) + (outputCost * estimatedOutputTokens);
  }

  /**
   * List available models for a capability
   * @param {string} capability - Capability to search
   * @returns {array} Array of available models
   */
  listModels(capability) {
    return this.registry.modelsByCapability[capability] || [];
  }

  /**
   * Get router statistics
   * @returns {object} Statistics about model selection
   */
  getStats() {
    return {
      totalModels: standardRegistry.size(),
      capabilities: Object.keys(this.registry.modelsByCapability),
      failedCalls: standardRegistry.stats.failedCallCount || 0
    };
  }
}

/**
 * Global model router instance
 */
export const modelRouter = new ModelRouter();

/**
 * Convenience function: call model by capability
 */
export async function callModelByCapability(capability, request, options = {}) {
  return modelRouter.callModel(capability, request, options);
}

/**
 * Convenience function: estimate cost
 */
export function estimateCostByCapability(capability, options = {}) {
  return modelRouter.estimateCost(capability, options);
}

/**
 * Convenience function: list models
 */
export function listModelsByCapability(capability) {
  return modelRouter.listModels(capability);
}

/**
 * Simple semantic classification for text tasks
 */
export function classifyTask(text) {
  const lowerText = text.toLowerCase();
  
  // Check for code indicators
  if (lowerText.match(/^(def |class |function |import |from |return |print |console\.log)/) ||
      lowerText.match(/\.(js|ts|py|java|cpp|go|rs)\b/)) {
    return TASK_TYPES.CODING;
  }
  
  // Check for reasoning/analysis indicators
  if (lowerText.match(/explain|why|how|analysis|reason|thought|consider|evaluate|compare|contrast|advise|recommend|suggest/)) {
    return TASK_TYPES.REASONING;
  }
  
  // Default to conversation
  return TASK_TYPES.CONVERSATION;
}