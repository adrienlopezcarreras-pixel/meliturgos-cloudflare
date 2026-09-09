import { DomainError, requireValue } from '../../core/contracts.js';

function normalizeText(result) {
  if (typeof result === 'string') return result.trim();
  const candidates = [
    result?.response,
    result?.text,
    result?.result?.response,
    result?.result?.text,
    result?.choices?.[0]?.message?.content,
    result?.result?.choices?.[0]?.message?.content,
  ];
  const text = candidates.find(value => typeof value === 'string' && value.trim());
  return text ? text.trim() : '';
}

/** Thin adapter around the Cloudflare Workers AI binding. */
export class WorkersAIProvider {
  constructor({ ai } = {}) {
    this.ai = ai;
  }

  async health() {
    return this.ai && typeof this.ai.run === 'function' ? 'ONLINE' : 'OFFLINE';
  }

  async invoke(model, messages, context = {}) {
    requireValue(this.ai && typeof this.ai.run === 'function', 'WORKERS_AI_BINDING_UNAVAILABLE', 503);
    requireValue(model?.provider === 'workers-ai', 'UNSUPPORTED_MODEL_PROVIDER', 422);
    requireValue(Array.isArray(messages) && messages.length > 0, 'MESSAGES_REQUIRED', 400);

    const modelId = model.model_id || model.id;
    const input = { messages };
    if (Number.isFinite(context.maxTokens)) input.max_tokens = Math.max(1, Math.min(8192, context.maxTokens));
    if (Number.isFinite(context.temperature)) input.temperature = Math.max(0, Math.min(2, context.temperature));

    let result;
    try {
      result = await this.ai.run(modelId, input);
    } catch (error) {
      const wrapped = new DomainError('provider_unavailable', 502);
      wrapped.cause = error;
      throw wrapped;
    }

    const text = normalizeText(result);
    requireValue(text, 'EMPTY_MODEL_RESPONSE', 502);
    return { text, response: text, provider: 'workers-ai', model: modelId, raw: result };
  }
}

export function createWorkersAIInvoke(env = {}) {
  const provider = new WorkersAIProvider({ ai: env.AI });
  return provider.invoke.bind(provider);
}

export const workersAINormalizeText = normalizeText;
