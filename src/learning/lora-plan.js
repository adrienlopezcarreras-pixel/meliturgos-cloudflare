const SAFE_ID = /^[A-Za-z0-9@._:/+\-]{1,240}$/;
const ALLOWED_QUANT = new Set(['none', '8bit', '4bit']);
const ALLOWED_STATUS = new Set(['DRAFT', 'READY_FOR_TRAINING', 'TRAINING', 'EVALUATING', 'APPROVED', 'REJECTED', 'ACTIVE', 'ROLLED_BACK']);
const READY_REQUIRED_STATUS = new Set(['READY_FOR_TRAINING', 'TRAINING', 'EVALUATING', 'APPROVED', 'ACTIVE']);

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
  rank = 8,
  alpha = 16,
  dropout = 0.05,
  learning_rate = 2e-4,
  epochs = 2,
  quantization = 'none',
  target_modules = ['q_proj', 'v_proj'],
  seed = 42,
  status,
} = {}) {
  const count = Math.max(0, Math.floor(Number(examples) || 0));
  const normalizedRank = Math.max(1, Math.min(32, Math.round(Number(rank) || 8));
  const normalizedQuantization = ALLOWED_QUANT.has(String(quantization)) ? String(quantization) : 'none';
  const cloudflareCompatible = normalizedRank <= 32 && normalizedQuantization === 'none';
  const ready = count >= 50 && cloudflareCompatible;
  const requestedStatus = status && ALLOWED_STATUS.has(String(status)) ? String(status) : null;
  const normalizedStatus = !ready && READY_REQUIRED_STATUS.has(requestedStatus)
    ? 'DRAFT'
    : (requestedStatus || (ready ? 'READY_FOR_TRAINING' : 'DRAFT'));
  return {
    id: safeId(id, 'ID'),
    base_model: safeId(base_model, 'BASE_MODEL'),
    dataset_digest: safeId(dataset_digest, 'DATASET_DIGEST'),
    examples: count,
    rank: normalizedRank,
    alpha: Math.max(1, Math.min(1024, Math.round(Number(alpha) || 16))),
    dropout: Math.max(0, Math.min(0.5, Number(dropout) || 0)),
    learning_rate: Math.max(1e-7, Math.min(1e-2, Number(learning_rate) || 2e-4)),
    epochs: Math.max(1, Math.min(20, Math.round(Number(epochs) || 2))),
    quantization: normalizedQuantization,
    target_modules: Array.isArray(target_modules) ? [...new Set(target_modules.map(x => safeId(x, 'TARGET_MODULE')))].slice(0, 32) : [],
    seed: Math.round(Number(seed) || 42),
    status: normalizedStatus,
    readiness: {
      ready_for_training: ready,
      enough_examples: count >= 50,
      min_examples: 50,
      base_weights_frozen: true,
      trainable_parameters: 'LORA_ADAPTER_ONLY',
      benchmark_required_before_activation: true,
      cloudflare_inference_compatible: cloudflareCompatible,
      cloudflare_requirements: {
        quantization: 'none',
        max_rank: 32,
        expected_files: ['adapter_config.json', 'adapter_model.safetensors'],
      },
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
  preferred_quantization: 'none',
  preferred_rank: 8,
  maximum_cloudflare_rank: 32,
  preferred_target_modules: ['q_proj', 'v_proj'],
  activation_requires_benchmark: true,
  activation_requires_no_major_regression: true,
});
