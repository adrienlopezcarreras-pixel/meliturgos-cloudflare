function normalizeMessages(input, context = {}) {
  if (Array.isArray(input)) return input;
  const messages = [];
  if (context.system) messages.push({ role: 'system', content: String(context.system) });
  messages.push({ role: 'user', content: typeof input === 'string' ? input : JSON.stringify(input) });
  return messages;
}

function extractText(result) {
  if (typeof result === 'string') return result;
  return result?.response ?? result?.text ?? result?.result?.response ?? result?.choices?.[0]?.message?.content ?? null;
}

export function createWorkersAIAdapter({
  env,
  modelId,
  id = `workers-ai:${modelId}`,
  capabilities = ['GENERAL'],
  priority = 0,
  estimatedCost = 0,
  concurrency = 2,
} = {}) {
  if (!modelId) throw new TypeError('WORKERS_AI_MODEL_REQUIRED');
  if (!env?.AI || typeof env.AI.run !== 'function') throw new TypeError('WORKERS_AI_BINDING_UNAVAILABLE');

  return {
    id,
    provider: 'workers-ai',
    modelId,
    capabilities,
    priority,
    estimatedCost,
    concurrency,
    health: 'UNKNOWN',
    async invoke({ input, context = {} } = {}) {
      const messages = normalizeMessages(input, context);
      const result = await env.AI.run(modelId, { messages });
      const text = extractText(result);
      if (!text || !String(text).trim()) {
        const error = new Error('EMPTY_WORKERS_AI_RESPONSE');
        error.code = 'EMPTY_WORKERS_AI_RESPONSE';
        throw error;
      }
      return {
        text: String(text).trim(),
        provenance: { provider: 'workers-ai', model: modelId },
        raw: result,
      };
    },
  };
}
