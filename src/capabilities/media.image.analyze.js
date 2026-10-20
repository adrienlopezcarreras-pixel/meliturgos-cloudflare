// src/capabilities/media.image.analyze.js

export async function analyze(imageData, { env }) {
  if (!imageData) {
    return { results: [] };
  }

  try {
    const response = await env.AI.run(
      '@cf/huggingface/cat-variant-detector',
      { image: imageData }
    );

    if (!response || !response.results || response.results.length === 0) {
      console.warn('media.image.analyze: empty response from Workers AI');
      return { results: [] };
    }

    return { results: response.results };
  } catch (error) {
    console.error('media.image.analyze: error during image analysis', error);
    return { results: [] };
  }
}