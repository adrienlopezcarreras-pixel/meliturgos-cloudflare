import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_LORA_BASE_MODEL, DEFAULT_LORA_RUNTIME_MODEL, assertAdapterActivationEvidence, assertAdapterArtifact, createLoraTrainingPlan } from '../../src/learning/lora-plan.js';

const DIGEST = 'sha256:' + 'a'.repeat(64);
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

function activationArtifact(plan, overrides = {}) {
  return artifact({
    dataset_digest: plan.dataset_digest,
    training_manifest_digest: plan.training_manifest_digest,
    ...overrides,
  });
}

function benchmarkCandidate(plan, overrides = {}) {
  return {
    overall: 0.74,
    suite_digest: 'suite-1',
    artifact_digest: DIGEST,
    training_manifest_digest: plan.training_manifest_digest,
    dataset_digest: plan.dataset_digest,
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
  assert.throws(() => assertAdapterArtifact(artifact({ size_bytes: 300_000_001 })), /LORA_ARTIFACT_SIZE_INVALID/);
  assert.throws(() => assertAdapterArtifact(artifact({ rank: 33 })), /LORA_ARTIFACT_RANK_INVALID/);
  assert.throws(
    () => assertAdapterArtifact(artifact({ runtime_model: '@cf/google/gemma-7b-it-lora' })),
    /LORA_RUNTIME_INCOMPATIBLE/,
  );
});

test('activation evidence requires same benchmark suite and measured gain', () => {
  const plan = readyPlan({ min_measured_gain: 0.02 });
  const baseline = { overall: 0.70, suite_digest: 'suite-1' };
  const candidate = benchmarkCandidate(plan);
  const checked = assertAdapterActivationEvidence({
    plan,
    artifact: activationArtifact(plan),
    baseline,
    candidate,
  });
  assert.ok(checked.measured_gain > 0.039 && checked.measured_gain < 0.041);

  assert.throws(
    () => assertAdapterActivationEvidence({
      plan,
      artifact: activationArtifact(plan),
      baseline,
      candidate: benchmarkCandidate(plan, { suite_digest: 'suite-2' }),
    }),
    /LORA_BENCHMARK_SUITE_MISMATCH/,
  );

  assert.throws(
    () => assertAdapterActivationEvidence({
      plan,
      artifact: activationArtifact(plan),
      baseline,
      candidate: benchmarkCandidate(plan, { overall: 0.71 }),
    }),
    /LORA_MEASURED_GAIN_INSUFFICIENT/,
  );
});

test('activation evidence fails closed on exact base-model mismatch', () => {
  const plan = readyPlan();
  assert.throws(
    () => assertAdapterActivationEvidence({
      plan,
      artifact: activationArtifact(plan, {
        base_model: 'google/gemma-7b-it',
        runtime_model: '@cf/google/gemma-7b-it-lora',
      }),
      baseline: { overall: 0.60, suite_digest: 'suite-1' },
      candidate: benchmarkCandidate(plan, { overall: 0.70 }),
    }),
    /LORA_BASE_MODEL_MISMATCH/,
  );
});
