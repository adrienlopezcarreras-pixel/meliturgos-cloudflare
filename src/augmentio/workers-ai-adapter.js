import { ProviderAdapter } from './provider-adapter.js';

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

function boundedNumber(value, min, max) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : null;
}

function inferenceOptions(context = {}) {
  const settings = context?.inference_settings && typeof context.inference_settings === 'object'
    ? context.inference_settings
    : null;
  const out = {};
  if (settings) {
    const temperature = boundedNumber(settings.temperature, 0, 5);
    const topP = boundedNumber(settings.top_p, 0.001, 1);
    const maxTokens = boundedNumber(settings.max_tokens, 1, 8192);
    if (temperature != null) out.temperature = temperature;
    if (topP != null) out.top_p = topP;
    if (maxTokens != null) out.max_tokens = Math.round(maxTokens);
  }
  // Only an already validated/activated adapter identifier may be supplied by
  // the caller. This adapter never trains, uploads or promotes a LoRA itself.
  const lora = String(context?.lora || '').trim();
  if (lora && /^[A-Za-z0-9@._:/+\-]{1,240}$/.test(lora)) out.lora = lora;
  return out;
}

export function createWorkersAIAdapter({
  env,
  modelId,
  id = `workers-ai:${modelId}`,
  capabilities = ['GENERAL'],
  priority = 0,
  estimatedCost = null,
  costProvenance = null,
  concurrency = 2,
} = {}) {
  if (!modelId) throw new TypeError('WORKERS_AI_MODEL_REQUIRED');
  if (!env?.AI || typeof env.AI.run !== 'function') throw new TypeError('WORKERS_AI_BINDING_UNAVAILABLE');

  return new ProviderAdapter({
    id,
    providerId: 'workers-ai',
    modelId,
    capabilities,
    priority,
    estimatedCost,
    costProvenance,
    concurrency,
    authRequired: false,
    terms: 'Cloudflare Workers AI binding; availability and quota depend on configured account/binding.',
    healthCheck: async () => (env?.AI && typeof env.AI.run === 'function' ? 'HEALTHY' : 'UNAVAILABLE'),
    quotaSnapshot: async () => ({ known: false, source: 'workers-ai-binding', note: 'Runtime binding does not expose an authoritative remaining quota snapshot here.' }),
    invoke: async ({ input, context = {}, signal } = {}) => {
      if (signal?.aborted) throw Object.assign(new Error('PROVIDER_ABORTED'), { code: 'PROVIDER_ABORTED' });
      const messages = normalizeMessages(input, context);
      const options = inferenceOptions(context);
      const result = await env.AI.run(modelId, { messages, ...options });
      const text = extractText(result);
      if (!text || !String(text).trim()) {
        const error = new Error('EMPTY_WORKERS_AI_RESPONSE');
        error.code = 'EMPTY_WORKERS_AI_RESPONSE';
        throw error;
      }
      return {
        text: String(text).trim(),
        provenance: {
          provider: 'workers-ai',
          model: modelId,
          inference_settings_applied: Object.keys(options).filter((key) => key !== 'lora'),
          lora_applied: Boolean(options.lora),
          lora: options.lora || null,
        },
        raw: result,
      };
    },
  });
}

export { inferenceOptions };