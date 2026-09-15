import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_LORA_BASE_MODEL,
  DEFAULT_LORA_RUNTIME_MODEL,
  assertAdapterActivationEvidence,
  assertAdapterArtifact,
  createLoraTrainingPlan,
} from '../../src/learning/lora-plan.js';

const DIGEST = `sha256:${'a'.repeat(64)}`;
const DATASET = 'dataset-v1';

function readyPlan(overrides = {}) {
  return createLoraTrainingPlan({
    base_model: DEFAULT_LORA_BASE_MODEL,
    runtime_model: DEFAULT_LORA_RUNTIME_MODEL,
    dataset_digest: DATASET,
    examples: 80,
    rank: 8,
    ...overrides,
  });
}

function artifact(overrides = {}) {
  return {
    id: 'mel-adapter-1',
    digest: DIGEST,
    base_model: DEFAULT_LORA_BASE_MODEL,
    runtime_model: DEFAULT_LORA_RUNTIME_MODEL,
    runtime: 'cloudflare-workers-ai',
    size_bytes: 42_000_000,
    rank: 8,
    format: 'safetensors',
    ...overrides,
  };
}

test('LoRA plan is ready only for an approved Cloudflare model pair', () => {
  const ok = readyPlan();
  assert.equal(ok.readiness.ready_for_training, true);
  assert.equal(ok.readiness.runtime_model_supported, true);

  const deprecated = readyPlan({
    base_model: '@cf/meta/llama-3.1-8b-instruct',
    runtime_model: '@cf/meta/llama-3.1-8b-instruct',
  });
  assert.equal(deprecated.readiness.ready_for_training, false);
  assert.equal(deprecated.readiness.cloudflare_inference_compatible, false);
});

test('artifact evidence requires SHA-256, bounded size, rank and compatible base/runtime pair', () => {
  assert.equal(assertAdapterArtifact(artifact()).digest, DIGEST);
  assert.throws(() => assertAdapterArtifact(artifact({ digest: 'fnv1a-deadbeef' })), /LORA_ARTIFACT_SHA256_REQUIRED/);
  assert.throws(() => assertAdapterArtifact(artifact({ size_bytes: 100_000_001 })), /LORA_ARTIFACT_SIZE_INVALID/);
  assert.throws(() => assertAdapterArtifact(artifact({ rank: 33 })), /LORA_ARTIFACT_RANK_INVALID/);
  assert.throws(() => assertAdapterArtifact(artifact({ runtime_model: '@cf/google/gemma-7b-it-lora' })), /LORA_RUNTIME_INCOMPATIBLE/);
});

test('activation evidence requires same benchmark suite and measured gain', () => {
  const plan = readyPlan({ min_measured_gain: 0.02 });
  const baseline = { overall: 0.70, suite_digest: 'suite-1' };
  const candidate = { overall: 0.74, suite_digest: 'suite-1' };
  const checked = assertAdapterActivationEvidence({ plan, artifact: artifact(), baseline, candidate });
  assert.ok(checked.measured_gain > 0.039 && checked.measured_gain < 0.041);

  assert.throws(
    () => assertAdapterActivationEvidence({
      plan,
      artifact: artifact(),
      baseline,
      candidate: { overall: 0.74, suite_digest: 'suite-2' },
    }),
    /LORA_BENCHMARK_SUITE_MISMATCH/,
  );

  assert.throws(
    () => assertAdapterActivationEvidence({
      plan,
      artifact: artifact(),
      baseline,
      candidate: { overall: 0.71, suite_digest: 'suite-1' },
    }),
    /LORA_MEASURED_GAIN_INSUFFICIENT/,
  );
});

test('activation evidence fails closed on exact base-model mismatch', () => {
  const plan = readyPlan();
  assert.throws(
    () => assertAdapterActivationEvidence({
      plan,
      artifact: artifact({ base_model: 'google/gemma-7b-it', runtime_model: '@cf/google/gemma-7b-it-lora' }),
      baseline: { overall: 0.60, suite_digest: 'suite-1' },
      candidate: { overall: 0.70, suite_digest: 'suite-1' },
    }),
    /LORA_BASE_MODEL_MISMATCH/,
  );
});
