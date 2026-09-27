import { Registry } from '../registry/registry.js';

/**
 * Capability: media.image.analyze
 * Description: Analyzes image content using vision models.
 * Source: 'vision' discovery source.
 * Policy: Zero-added-cost, fail-closed.
 */
export const MediaImageAnalyzeCapability = {
  id: 'media.image.analyze',
  name: 'Analyze Image',
  description: 'Analyze image content using vision models.',
  version: '1.0.0',
  execute: async (context, input) => {
    // Fail-closed: Check provider availability
    const provider = await Registry.get('vision');
    if (!provider || !provider.run) {
      throw new Error(`Provider 'vision' unavailable for capability ${this.id}. Fail-closed.`);
    }

    // Execute with zero-added-cost policy
    const result = await provider.run(input);

    return result;
  }
};