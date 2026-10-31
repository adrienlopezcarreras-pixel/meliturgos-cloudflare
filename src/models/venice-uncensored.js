// Venice inference via OpenRouter. OPENROUTER_API_KEY is stored as a Cloudflare secret.

export const VENICE_MODEL = 'cognitivecomputations/dolphin-mistral-24b-venice-edition';
const ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';

export function veniceConfigured(env) {
  return typeof env?.OPENROUTER_API_KEY === 'string' && env.OPENROUTER_API_KEY.trim().length > 20;
}

export async function runVeniceInference({ env, messages, deadlineAt = null, fetchImpl = fetch } = {}) {
  const remaining = deadlineAt ? Math.max(1000, Number(deadlineAt) - Date.now()) : 60_000;
  const response = await fetchImpl(ENDPOINT, {
    method: 'POST',
    headers: { authorization: 'Bearer ' + env.OPENROUTER_API_KEY, 'content-type': 'application/json' },
    body: JSON.stringify({ model: VENICE_MODEL, messages: (messages || []).map(m => ({ role: String(m?.role || 'user'), content: String(m?.content || '') })) }),
    signal: AbortSignal.timeout(Math.min(remaining, 90_000)),
  });
  if (!response.ok) throw Object.assign(new Error('VENICE_HTTP_' + response.status), { code: 'VENICE_HTTP_' + response.status });
  const body = await response.json();
  const text = String(body?.choices?.[0]?.message?.content || '');
  if (!text.trim()) throw Object.assign(new Error('VENICE_EMPTY_RESPONSE'), { code: 'VENICE_EMPTY_RESPONSE' });
  return { text, model: VENICE_MODEL, provider: 'openrouter', tool_succeeded: true, finish_reason: body?.choices?.[0]?.finish_reason || null };
}
