// The PC lightens MEL. It does not replace it.
// Text the local model can answer is kept off Workers AI.
// Images, voice models, transcripts, embeddings, LoRA and reserved
// multi-model votes stay on the neuron budget.

const CLOUD_ONLY = /stable-diffusion|flux|llava|aura-1|whisper|embedding|bge-|@cf\/baai/i;

export function pcCanHandle(model, inputs = {}) {
  if (inputs?.neuron_reserve === true || inputs?.lora) return false;
  if (inputs?.image || inputs?.audio || Array.isArray(inputs?.text)) return false;
  if (CLOUD_ONLY.test(String(model || ''))) return false;
  const messages = Array.isArray(inputs?.messages) ? inputs.messages : [];
  return messages.some(message => typeof message?.content === 'string' && message.content.trim());
}
