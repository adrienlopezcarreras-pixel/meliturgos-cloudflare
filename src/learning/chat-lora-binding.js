import { CLOUDFLARE_LORA_MODEL_PAIRS } from './lora-plan.js';

const CENSORSHIP_REFUSAL = /\b(?:je ne peux pas (?:vous aider|aider avec|r[eé]pondre [aà] (?:ça|cela|cette))|je (?:dois|vais) refuser|contenu (?:interdit|inappropri[eé])|i (?:can(?:not|'t)|won't|will not) (?:help|assist)|cannot assist|against (?:my|our|the) (?:guidelines|policies)|content policy|usage policy|i'm not able to (?:help|provide))\b/i;

// A short policy refusal only. A long answer, a missing tool or a missing
// adapter is not a censorship failure and must not change the mode.
export function isCensorshipRefusal(text) {
  const value = String(text || '').trim();
  return value.length > 0 && value.length <= 500 && CENSORSHIP_REFUSAL.test(value);
}

// Only the server's promoted adapter is accepted; never a browser-supplied ID.
export function requireChatLora(active) {
  const base = active?.base_model || active?.adapter?.base_model;
  const runtime = active?.runtime_model || active?.adapter?.runtime_model;
  const finetune = active?.finetune_id || active?.adapter?.finetune_id;
  if (!base || !runtime || !finetune || CLOUDFLARE_LORA_MODEL_PAIRS[base] !== runtime) {
    throw Object.assign(new Error('LORA_COMPATIBLE_ACTIVE_ADAPTER_REQUIRED'), { code:'LORA_COMPATIBLE_ACTIVE_ADAPTER_REQUIRED' });
  }
  return { plan_id:active.plan_id || null, base_model:base, runtime_model:runtime, finetune_id:finetune };
}

export function chatLoraReceipt(active, inference) {
  try {
    const adapter = requireChatLora(active);
    return inference?.provider === 'workers-ai' && inference?.model === adapter.runtime_model
      ? { ...adapter, applied:true }
      : null;
  } catch { return null; }
}

// MEL-LORA-MODE-01: the Mistral adapter and the Qwen model are two different
// things. A Qwen record must never satisfy the Mistral adapter check, and the
// reverse, or the mode would run on the wrong weights while claiming the
// other. And when neither is usable, the mode is REFUSED with its exact
// reason: a silent fallback to an ordinary cloud model would answer in the
// name of a LoRA that never ran.
export const QWEN_LORA_BASE = 'Qwen/Qwen3-14B';

export function loraModeKind(record) {
  const base = String(record?.base_model || record?.adapter?.base_model || '').trim();
  if (!base) return null;
  if (base === QWEN_LORA_BASE) return 'QWEN_MODEL';
  return CLOUDFLARE_LORA_MODEL_PAIRS[base] ? 'MISTRAL_ADAPTER' : null;
}

// Explicit refusal, never a silent fallback. `reason` says which of absence,
// quota or failure stopped the mode, so the owner reads the real cause.
export function resolveLoraMode({ adapter = null, qwen = null, quota = null, failure = null } = {}) {
  const refuse = (code, detail) => ({ ok: false, kind: null, code, detail: String(detail || '').slice(0, 200), fallback: 'NONE' });
  // A Qwen record offered as the Mistral adapter is a confusion, not a mode.
  if (adapter && loraModeKind(adapter) === 'QWEN_MODEL') return refuse('LORA_MODE_ADAPTER_KIND_MISMATCH', 'Qwen proposé comme adaptateur Mistral');
  if (qwen && loraModeKind(qwen) === 'MISTRAL_ADAPTER') return refuse('LORA_MODE_ADAPTER_KIND_MISMATCH', 'adaptateur Mistral proposé comme modèle Qwen');
  if (quota?.exhausted === true) return refuse('LORA_MODE_QUOTA_EXHAUSTED', quota.detail || quota.code);
  if (failure) return refuse('LORA_MODE_PROVIDER_FAILED', failure?.code || failure?.message || failure);
  if (adapter) {
    try { return { ok: true, kind: 'MISTRAL_ADAPTER', adapter: requireChatLora(adapter), code: null, fallback: 'NONE' }; }
    catch (error) { return refuse(String(error?.code || 'LORA_MODE_ADAPTER_INVALID'), 'adaptateur Mistral incompatible'); }
  }
  if (qwen) return { ok: true, kind: 'QWEN_MODEL', adapter: { base_model: QWEN_LORA_BASE, adapter_id: String(qwen.adapter_id || '') }, code: null, fallback: 'NONE' };
  return refuse('LORA_MODE_ADAPTER_ABSENT', 'aucun adaptateur validé actif');
}
