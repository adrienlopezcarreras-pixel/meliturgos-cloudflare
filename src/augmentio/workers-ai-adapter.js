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
  // gpt-oss-120b answers in the Responses format (output_text / output[]).
  const responses = Array.isArray(result?.output)
    ? result.output.flatMap(item => (Array.isArray(item?.content) ? item.content : []))
      .filter(part => part?.type === 'output_text' && typeof part.text === 'string').map(part => part.text).join('') || null
    : null;
  const value = result?.response ?? result?.text ?? result?.result?.response ?? result?.choices?.[0]?.message?.content ?? result?.output_text ?? responses ?? null;
  // Some Workers AI models (llama-3.3-70b) return a JSON answer already
  // parsed; String(object) gave "[object Object]" and lost every proposal.
  const text = value && typeof value === 'object' ? JSON.stringify(value) : value;
  return typeof text === 'string' ? harmonyFinal(text) : text;
}

// gpt-oss can leak its raw harmony channels ("<|channel|>analysis ...") into
// the answer; the Mentor then rejected it as MENTOR_JSON_REQUIRED (25/10).
// Keep only the final channel; an answer with no final channel is empty.
export function harmonyFinal(text) {
  if (!text.includes('<|channel|>')) return text;
  const marker = text.lastIndexOf('<|channel|>final');
  if (marker < 0) return '';
  const start = text.indexOf('<|message|>', marker);
  const body = start < 0 ? text.slice(marker + '<|channel|>final'.length) : text.slice(start + '<|message|>'.length);
  return body.replace(/<\|(end|return|call)\|>[\s\S]*$/, '').trim();
}

function boundedNumber(value, min, max) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : null;
}

const COUNCIL_NON_REASONING_MODELS = new Set([
  '@cf/google/gemma-4-26b-a4b-it',
  '@cf/nvidia/nemotron-3-120b-a12b',
]);

const RESERVED_COUNCIL_PURPOSES = new Set([
  'model-council-independent-critique',
  'model-council-synthesis',
  'state-of-play-before-development',
  'mel-council-synthesis',
]);
const NON_REASONING_PURPOSES = new Set([
  ...RESERVED_COUNCIL_PURPOSES,
  'mel-autonomous-development',
  'mel-autonomous-development-structured-repair',
]);

function inferenceOptions(context = {}, modelId = '') {
  const settings = context?.inference_settings && typeof context.inference_settings === 'object'
    ? context.inference_settings
    : null;
  const out = {};
  if (RESERVED_COUNCIL_PURPOSES.has(String(context?.purpose || '').trim())) out.neuron_reserve = true;
  if (settings) {
    const temperature = boundedNumber(settings.temperature, 0, 5);
    const topP = boundedNumber(settings.top_p, 0.001, 1);
    const maxTokens = boundedNumber(settings.max_tokens, 1, 8192);
    if (temperature != null) out.temperature = temperature;
    if (topP != null) out.top_p = topP;
    if (maxTokens != null) out.max_tokens = Math.round(maxTokens);
  }
  // Cloudflare documents enable_thinking=false for Gemma 4 and Nemotron 3.
  // Council probes and Mentor code proposals need the visible answer, not a
  // reasoning trace that leaves response empty. Ordinary chat is unchanged.
  if (
    NON_REASONING_PURPOSES.has(String(context?.purpose || '').trim())
    && COUNCIL_NON_REASONING_MODELS.has(String(modelId || '').trim())
  ) {
    out.chat_template_kwargs = { enable_thinking: false };
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
      const options = inferenceOptions(context, modelId);
      const result = await env.AI.run(modelId, { messages, ...options });
      if (options.neuron_reserve === true && (result?.local === true || result?.provider === 'local-pc' || String(result?.model || '').startsWith('pc:'))) {
        throw Object.assign(new Error('COUNCIL_LOCAL_SUBSTITUTE_REFUSED'), {code:'COUNCIL_LOCAL_SUBSTITUTE_REFUSED'});
      }
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

export { inferenceOptions, extractText as extractWorkersAIText };