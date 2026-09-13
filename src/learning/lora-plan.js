const SAFE_ID = /^[A-Za-z0-9@._:/+\-]{1,240}$/;
const ALLOWED_QUANT = new Set(['none', '8bit', '4bit']);
const ALLOWED_STATUS = new Set(['DRAFT', 'READY_FOR_TRAINING', 'TRAINING', 'EVALUATING', 'APPROVED', 'REJECTED', 'ACTIVE', 'ROLLED_BACK']);

function bounded(value, max = 1000) {
  const text = String(value ?? '').trim();
  return text.length > max ? text.slice(0, max) : text;
}

function safeId(value, label) {
  const text = bounded(value, 240);
  if (!SAFE_ID.test(text)) throw Object.assign(new Error(`LORA_INVALID_${label}`), { code: `LORA_INVALID_${label}` });
  return text;
}

export function createLoraTrainingPlan({
  id = `mel-lora-${Date.now()}`,
  base_model,
  dataset_digest,
  examples = 0,
  rank = 16,
  alpha = 32,
  dropout = 0.05,
  learning_rate = 2e-4,
  epochs = 2,
  quantization = '4bit',
  target_modules = ['q_proj', 'k_proj', 'v_proj', 'o_proj'],
  seed = 42,
  status,
} = {}) {
  const count = Math.max(0, Math.floor(Number(examples) || 0));
  const ready = count >= 50;
  return {
    id: safeId(id, 'ID'),
    base_model: safeId(base_model, 'BASE_MODEL'),
    dataset_digest: safeId(dataset_digest, 'DATASET_DIGEST'),
    examples: count,
    rank: Math.max(1, Math.min(256, Math.round(Number(rank) || 16))),
    alpha: Math.max(1, Math.min(1024, Math.round(Number(alpha) || 32))),
    dropout: Math.max(0, Math.min(0.5, Number(dropout) || 0)),
    learning_rate: Math.max(1e-7, Math.min(1e-2, Number(learning_rate) || 2e-4)),
    epochs: Math.max(1, Math.min(20, Math.round(Number(epochs) || 2))),
    quantization: ALLOWED_QUANT.has(String(quantization)) ? String(quantization) : '4bit',
    target_modules: Array.isArray(target_modules) ? [...new Set(target_modules.map(x => safeId(x, 'TARGET_MODULE')))].slice(0, 32) : [],
    seed: Math.round(Number(seed) || 42),
    status: status && ALLOWED_STATUS.has(String(status)) ? String(status) : (ready ? 'READY_FOR_TRAINING' : 'DRAFT'),
    readiness: {
      enough_examples: ready,
      min_examples: 50,
      base_weights_frozen: true,
      trainable_parameters: 'LORA_ADAPTER_ONLY',
      benchmark_required_before_activation: true,
    },
  };
}

export function assertAdapterArtifact(artifact = {}) {
  const id = safeId(artifact.id, 'ARTIFACT_ID');
  const digest = safeId(artifact.digest, 'ARTIFACT_DIGEST');
  const baseModel = safeId(artifact.base_model, 'BASE_MODEL');
  const format = bounded(artifact.format || 'safetensors', 80);
  if (!['safetensors', 'peft'].includes(format)) throw Object.assign(new Error('LORA_UNSUPPORTED_ARTIFACT_FORMAT'), { code: 'LORA_UNSUPPORTED_ARTIFACT_FORMAT' });
  return { id, digest, base_model: baseModel, format, uri: bounded(artifact.uri, 2000) || null };
}

export const loraPolicy = Object.freeze({
  minimum_validated_examples: 50,
  base_weights_frozen: true,
  preferred_quantization: '4bit',
  activation_requires_benchmark: true,
  activation_requires_no_major_regression: true,
});
