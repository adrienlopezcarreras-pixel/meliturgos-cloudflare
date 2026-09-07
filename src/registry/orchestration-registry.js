/**
 * orchestration-registry.js
 * 
 * Helper pour gestion des fallbacks orchestrés
 * Gère la transition orchestrée entre modèles et tracking de metadata
 */

import { ModelRegistry, standardRegistry } from '../models/ModelRegistry.js';

export class OrchestratedFallback {
  constructor(modelRegistry) {
    this.registry = modelRegistry;
  }

  /**
   * Calls the primary model with fallback chain
   * 
   * @param {object} DB - D1 database binding if needed
   * @param {string} prompt - Prompt to send to model
   * @param {object} options - { capability?, metadata?, etc. }
   * @returns {Promise<{ success: boolean, model: string, content: string, attempts: Array }>}
   */
  async callWithFallback(DB, prompt, options = {}) {
    const results = {
      success: false,
      model: null,
      content: null,
      attempts: [],
      metadata: {
        capability: options.capability,
        input_tokens: 0,
        output_tokens: 0
      }
    };

    const { capability, capacity_params, ...restOptions } = options;
    
    // Get primary model for capability
    let primaryModel = null;
    if (capability) {
      primaryModel = this.registry.getBestByCapability(capability);
    }
    if (!primaryModel) {
      primaryModel = this.registry.getBestByCapability("code");
    }
    if (!primaryModel) {
      throw new Error("No models available");
    }

    const primaryId = primaryModel.id;
    results.attempts.push({
      attempt: 1,
      model: primaryId,
      model_name: primaryModel.name,
      startTime: Date.now(),
      success: null,  // undefined initially
      error: null
    });

    try {
      // Call primary model (actual implementation would use Workers AI binding)
      // This is a simulation for testing
      const primaryResult = {
        success: true,
        content: `Result from ${primaryModel.name}`,
        tokens: 100
      };

      results.success = primaryResult.success;
      results.model = primaryId;
      results.content = primaryResult.content;
      results.metadata.input_tokens = primaryResult.tokens;
      results.metadata.output_tokens = primaryResult.tokens;

      results.attempts[0].success = true;
      results.attempts[0].endTime = Date.now();
      results.attempts[0].duration_ms = results.attempts[0].endTime - results.attempts[0].startTime;

    } catch (error) {
      console.warn(`[orchestration-registry] Primary model failed: ${error.message}`);

      // Try fallback chain
      const fallbacks = this.registry.getFallbackChain(primaryId, 2);
      
      for (let i = 0; i < fallbacks.length; i++) {
        const fallbackModel = fallbacks[i];
        const attemptNum = i + 2;
        
        results.attempts.push({
          attempt: attemptNum,
          model: fallbackModel.id,
          model_name: fallbackModel.name,
          startTime: Date.now(),
          success: null,
          error: null
        });

        try {
          // Simulate fallback call
          const fallbackResult = {
            success: true,
            content: `Fallback result from ${fallbackModel.name}`,
            tokens: 80
          };

          results.success = fallbackResult.success;
          results.model = fallbackModel.id;
          results.content = fallbackResult.content;
          results.metadata.input_tokens = fallbackResult.tokens;
          results.metadata.output_tokens = fallbackResult.tokens;

          results.attempts[attemptNum - 1].success = true;
          results.attempts[attemptNum - 1].endTime = Date.now();
          results.attempts[attemptNum - 1].duration_ms = 
            results.attempts[attemptNum - 1].endTime - results.attempts[attemptNum - 1].startTime;

          console.log(`[orchestration-registry] Fallback to ${fallbackModel.name} succeeded`);
          break;  // Success, exit loop

        } catch (error) {
          results.attempts[attemptNum - 1].success = false;
          results.attempts[attemptNum - 1].error = error.message;
          results.attempts[attemptNum - 1].endTime = Date.now();
          results.attempts[attemptNum - 1].duration_ms = 
            results.attempts[attemptNum - 1].endTime - results.attempts[attemptNum - 1].startTime;

          console.warn(`[orchestration-registry] Fallback ${i + 1} failed: ${error.message}`);
        }
      }

      if (!results.success) {
        throw new Error(`All models failed after ${results.attempts.length} attempts`);
      }
    }

    return results;
  }

  /**
   * Tracks orchestration metadata in D1 (if database available)
   */
  async trackMetadata(DB, orchestratorId, result) {
    if (!DB) return;

    try {
      await DB.prepare(`
        INSERT INTO orchestration_metadata 
        (orchestrator_id, model, success, attempts, metadata, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).bind(
        orchestratorId,
        result.model,
        result.success,
        JSON.stringify(result.attempts),
        JSON.stringify(result.metadata),
        Date.now()
      ).run();

      console.log(`[orchestration-registry] Metadata tracked: ${orchestratorId}`);
    } catch (error) {
      console.warn(`[orchestration-registry] Failed to track metadata: ${error.message}`);
    }
  }
}

/**
 * Standard registry instance
 */
export const orchestratedFallback = new OrchestratedFallback(standardRegistry);