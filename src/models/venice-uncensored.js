// UNCENSORED mode through Venice Uncensored (Dolphin Mistral 24B Venice
// Edition) on OpenRouter, owner decision 31/10. The key lives only in the
// Cloudflare secret OPENROUTER_API_KEY; without it the mode keeps its LoRA path.
// One limit stays whatever the model allows: requests that Llama Guard 3 files
// under S9 (indiscriminate weapons) are not relayed. Everything else passes.

export const VENICE_MODEL = 'cognitivecomputations/dolphin-mistral-24b-venice-edition';
export const GUARD_MODEL = '@cf/meta/llama-guard-3-8b';
const ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';
export const WEAPONS_REFUSAL = 'Je réponds à tout en mode UNCENSORED, sauf à une seule chose : des instructions pour fabriquer des armes à effet de masse. Pose-moi autre chose.';

export function veniceConfigured(env) {
  return typeof env?.OPENROUTER_API_KEY === 'string' && env.OPENROUTER_API_KEY.trim().length > 20;
}

/** True when Llama Guard classifies the request as S9; null when the guard is unavailable. */
export async function weaponsGuard(env, messages) {
  if (typeof env?.AI?.run !== 'function') return null;
  try {
    const last = [...(Array.isArray(messages) ? messages : [])].reverse().find(message => message?.role === 'user');
    const out = await env.AI.run(GUARD_MODEL, { messages: [{ role: 'user', content: String(last?.content || '').slice(0, 8000) }] });
    const text = String(out?.response?.categories ? JSON.stringify(out.response) : (out?.response ?? out ?? ''));
    return /\bS9\b/.test(text);
  } catch {
    return null;
  }
}

export async function runVeniceInference({ env, messages, deadlineAt = null, fetchImpl = fetch } = {}) {
  const blocked = await weaponsGuard(env, messages);
  // The guard must answer before anything is relayed.
  if (blocked === null) throw Object.assign(new Error('UNCENSORED_GUARD_UNAVAILABLE'), { code: 'UNCENSORED_GUARD_UNAVAILABLE' });
  if (blocked) return { text: WEAPONS_REFUSAL, model: GUARD_MODEL, provider: 'mel-guard', blocked: true, tool_succeeded: true };
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
