// src/media/image.js
import { env } from '$fresh/runtime.ts';

export async function analyze(imageBuffer) {
  try {
    // Enhanced prompt to encourage detailed, non-empty response
    const response = await env.AI.run('@cf/huggingface/image-caption-base', {
      image: imageBuffer,
      prompt: 'Provide a detailed description of this image, including objects, colors, layout, and any visible text. Be specific and thorough.'
    });

    // Fail-closed: validate response is non-empty string
    if (!response || typeof response !== 'string' || !response.trim()) {
      throw new Error('EMPTY_WORKERS_AI_RESPONSE: Image analysis returned empty or invalid response');
    }

    return {
      description: response.trim(),
      provider: 'workers-ai:@cf/huggingface/image-caption-base',
      provenance: { source: 'workers-ai', model: '@cf/huggingface/image-caption-base' }
    };
  } catch (error) {
    // Fail-closed: propagate error without fallback to paid providers
    if (error.message.includes('EMPTY_WORKERS_AI_RESPONSE')) {
      throw error;
    }
    throw new Error(`IMAGE_ANALYSIS_FAILED: ${error.message}`);
  }
}
