import { CLOUDFLARE_LORA_MODEL_PAIRS } from './lora-plan.js';

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
