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
