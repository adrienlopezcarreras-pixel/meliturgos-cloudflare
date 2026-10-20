// src/media/image.js
import { AI } from '../augmentio/augmentio.js';

/**
 * Analyze an image using the configured AI model.
 * @param {ImageData} image - The image data to analyze.
 * @param {Object} [options] - Optional parameters.
 * @returns {Promise<Object>} The analysis result.
 */
export async function analyze(image, options = {}) {
  try {
    // Use the first available provider from the augmentio pool
    const result = await AI.run('@cf/hf/vision-feature-extraction', { image }, options);

    // Guard against empty response
    if (!result || Object.keys(result).length === 0) {
      // Log a warning for debugging
      console.warn('media.image.analyze: received empty response from AI model');
      // Return a safe empty result to prevent EMPTY_WORKERS_AI_RESPONSE errors
      return { error: 'EMPTY_WORKERS_AI_RESPONSE', data: null };
    }

    return result;
  } catch (error) {
    // Fail-closed: on any error, return a safe error object
    console.error('media.image.analyze: error during image analysis', error);
    return { error: error.message || 'UNKNOWN_ERROR', data: null };
  }
}