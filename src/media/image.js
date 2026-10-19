export async function analyzeImage(imageData) {
  try {
    const response = await env.AI.run('@cf/hf/vision-encoder', { image: imageData });
    if (!response || (typeof response === 'string' && response.trim() === '') || (typeof response === 'object' && Object.keys(response).length === 0)) {
      throw new Error('EMPTY_WORKERS_AI_RESPONSE');
    }
    return response;
  } catch (error) {
    if (error.message === 'EMPTY_WORKERS_AI_RESPONSE') {
      throw error;
    }
    throw new Error(`WORKERS_AI_FAILURE: ${error.message}`);
  }
}