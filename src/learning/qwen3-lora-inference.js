/**
 * Trusted, optional Qwen3-14B LoRA service binding.
 * This module never installs, activates or promotes an adapter.
 * Only a server-stored Qwen approval and an actual service-bound adapter
 * receipt can justify claiming that the fallback was used.
 */
const EXACT_QWEN_BASE = 'Qwen/Qwen3-14B';
const SHA256 = /^sha256:[0-9a-f]{64}$/i;
const INVALID = (code) => Object.assign(new Error(code), { code });

export function requireActiveQwen3Lora(active, env) {
  const base = String(active?.base_model || '');
  const id = String(active?.adapter_id || '');
  const digest = String(active?.adapter_sha256 || '');
  if (base !== EXACT_QWEN_BASE || !id || id.length > 240 || !SHA256.test(digest)
      || active?.benchmark?.approved !== true
      || active?.activation?.approved !== true
      || !String(active?.activation?.approval_id || '').trim()) {
    throw INVALID('QWEN3_VALIDATED_ACTIVE_ADAPTER_REQUIRED');
  }
  if (env?.MEL_QWEN3_LORA_BUDGET_APPROVED !== 'true'
      || typeof env?.QWEN3_LORA_SERVICE?.fetch !== 'function') {
    throw INVALID('QWEN3_TRUSTED_SERVICE_NOT_CONFIGURED');
  }
  return {
    base_model: base,
    adapter_id: id,
    adapter_sha256: digest,
    approval_id: active.activation.approval_id,
  };
}

export async function runQwen3LoraInference({env, active, messages, deadlineAt} = {}) {
  const adapter = requireActiveQwen3Lora(active, env);
  const remaining = deadlineAt == null ? 10000 : Math.min(10000, deadlineAt - Date.now());
  if (remaining < 500) throw INVALID('QWEN3_INFERENCE_DEADLINE');
  const safeMessages = Array.isArray(messages) ? messages.slice(-40).map(m => ({
    role: String(m?.role || 'user'),
    content: String(m?.content || '').slice(0, 16000),
  })).filter(m => ['system', 'user', 'assistant'].includes(m.role) && m.content) : [];
  if (!safeMessages.some(m => m.role === 'user')) throw INVALID('QWEN3_MESSAGE_REQUIRED');

  const request = new Request('https://qwen3-lora.internal/v1/chat', {
    method: 'POST',
    headers: {'content-type': 'application/json'},
    signal: AbortSignal.timeout(remaining),
    body: JSON.stringify({
      model: EXACT_QWEN_BASE,
      adapter_id: adapter.adapter_id,
      adapter_sha256: adapter.adapter_sha256,
      messages: safeMessages,
    }),
  });
  let response;
  try {
    response = await env.QWEN3_LORA_SERVICE.fetch(request);
  } catch {
    throw INVALID('QWEN3_SERVICE_UNAVAILABLE');
  }
  if (!response?.ok) throw INVALID('QWEN3_SERVICE_UNAVAILABLE');
  let payload;
  try { payload = await response.json(); }
  catch { throw INVALID('QWEN3_INVALID_SERVICE_RESPONSE'); }
  const text = String(payload?.text || '').trim();
  if (!text) throw INVALID('QWEN3_EMPTY_SERVICE_RESPONSE');
  if (payload?.model !== EXACT_QWEN_BASE
      || payload?.adapter_id !== adapter.adapter_id
      || payload?.adapter_sha256 !== adapter.adapter_sha256
      || payload?.adapter_applied !== true) {
    throw INVALID('QWEN3_ADAPTER_RECEIPT_MISMATCH');
  }
  return {
    text,
    model: EXACT_QWEN_BASE,
    provider: 'qwen3-lora-service',
    task: 'REASONING',
    fallback_used: true,
    active_qwen_adapter_id: adapter.adapter_id,
    active_qwen_adapter_sha256: adapter.adapter_sha256,
    service_receipt_validated: true,
  };
}

export function qwen3LoraReceipt(active, inference) {
  if (inference?.provider !== 'qwen3-lora-service' || inference?.model !== EXACT_QWEN_BASE
      || inference?.service_receipt_validated !== true) return null;
  try {
    const adapter = requireActiveQwen3Lora(active, {
      MEL_QWEN3_LORA_BUDGET_APPROVED: 'true',
      QWEN3_LORA_SERVICE: {fetch: () => null},
    });
    if (adapter.adapter_id !== inference.active_qwen_adapter_id
        || adapter.adapter_sha256 !== inference.active_qwen_adapter_sha256) return null;
    return {...adapter, runtime_model: EXACT_QWEN_BASE, applied: true};
  } catch { return null; }
}
