import test from 'node:test';
import assert from 'node:assert/strict';
import { createLoraTrainingPlan, assertAdapterArtifact, assertAdapterActivationEvidence } from '../src/learning/lora-plan.js';
import { runLearningBenchmark } from '../src/learning/benchmark-suite.js';

const digest = (char) => `sha256:${char.repeat(64)}`;
const SUITE_DIGEST = digest('f');

function makePlan(overrides = {}) {
  return createLoraTrainingPlan({
    id: 'mel-lora-provenance-test',
    dataset_digest: digest('1'),
    examples: 50,
    min_measured_gain: 0.02,
    ...overrides,
  });
}

function makeArtifact(plan, overrides = {}) {
  return {
    id: 'adapter-provenance-test',
    digest: digest('a'),
    base_model: plan.base_model,
    runtime_model: plan.runtime_model,
    runtime: plan.runtime,
    size_bytes: 1024,
    rank: plan.rank,
    format: 'safetensors',
    dataset_digest: plan.dataset_digest,
    training_manifest_digest: plan.training_manifest_digest,
    ...overrides,
  };
}

function makeEvidence(plan, artifact, overrides = {}) {
  const baseline = { overall: 0.5, suite_digest: SUITE_DIGEST };
  const candidate = {
    overall: 0.6,
    suite_digest: SUITE_DIGEST,
    artifact_digest: artifact.digest,
    training_manifest_digest: plan.training_manifest_digest,
    dataset_digest: plan.dataset_digest,
    ...overrides,
  };
  return { plan, artifact, baseline, candidate };
}

function hasCode(code) {
  return (error) => error?.code === code;
}

test('generic LoRA artifact validation remains compatible without activation provenance', () => {
  const plan = makePlan();
  const artifact = makeArtifact(plan);
  delete artifact.dataset_digest;
  delete artifact.training_manifest_digest;
  const checked = assertAdapterArtifact(artifact);
  assert.equal(checked.dataset_digest, null);
  assert.equal(checked.training_manifest_digest, null);
});

test('LoRA activation fails closed when artifact provenance is missing', () => {
  const plan = makePlan();
  const artifact = makeArtifact(plan);
  delete artifact.dataset_digest;
  delete artifact.training_manifest_digest;
  assert.throws(
    () => assertAdapterActivationEvidence(makeEvidence(plan, artifact)),
    hasCode('LORA_ARTIFACT_PROVENANCE_REQUIRED'),
  );
});

test('LoRA activation accepts only exact dataset, manifest, artifact and benchmark provenance', () => {
  const plan = makePlan();
  const artifact = makeArtifact(plan);
  const result = assertAdapterActivationEvidence(makeEvidence(plan, artifact));
  assert.equal(result.dataset_digest, plan.dataset_digest);
  assert.equal(result.training_manifest_digest, plan.training_manifest_digest);
  assert.equal(result.benchmark_artifact_digest, artifact.digest);
  assert.notEqual(plan.training_manifest_digest, plan.dataset_digest);
});

test('LoRA activation rejects a benchmark produced for another artifact', () => {
  const plan = makePlan();
  const artifact = makeArtifact(plan);
  assert.throws(
    () => assertAdapterActivationEvidence(makeEvidence(plan, artifact, { artifact_digest: digest('b') })),
    hasCode('LORA_BENCHMARK_ARTIFACT_MISMATCH'),
  );
});

test('LoRA activation rejects stale benchmark manifest provenance', () => {
  const plan = makePlan();
  const artifact = makeArtifact(plan);
  assert.throws(
    () => assertAdapterActivationEvidence(makeEvidence(plan, artifact, { training_manifest_digest: digest('c') })),
    hasCode('LORA_BENCHMARK_MANIFEST_MISMATCH'),
  );
});

test('LoRA activation rejects benchmark provenance for another dataset', () => {
  const plan = makePlan();
  const artifact = makeArtifact(plan);
  assert.throws(
    () => assertAdapterActivationEvidence(makeEvidence(plan, artifact, { dataset_digest: digest('d') })),
    hasCode('LORA_BENCHMARK_DATASET_MISMATCH'),
  );
});

test('LoRA activation rejects artifact manifest digest confused with dataset digest', () => {
  const plan = makePlan();
  const artifact = makeArtifact(plan, { training_manifest_digest: plan.dataset_digest });
  assert.throws(
    () => assertAdapterActivationEvidence(makeEvidence(plan, artifact)),
    hasCode('LORA_TRAINING_MANIFEST_MISMATCH'),
  );
});

test('LoRA activation fails closed when benchmark provenance is missing', () => {
  const plan = makePlan();
  const artifact = makeArtifact(plan);
  const evidence = makeEvidence(plan, artifact);
  delete evidence.candidate.artifact_digest;
  delete evidence.candidate.training_manifest_digest;
  delete evidence.candidate.dataset_digest;
  assert.throws(
    () => assertAdapterActivationEvidence(evidence),
    hasCode('LORA_BENCHMARK_PROVENANCE_REQUIRED'),
  );
});

test('LoRA activation rejects a zero-percent benchmark even when minimum gain is configured to zero', () => {
  const plan = makePlan({ min_measured_gain: 0 });
  const artifact = makeArtifact(plan);
  const evidence = makeEvidence(plan, artifact, { overall: 0 });
  evidence.baseline.overall = 0;
  assert.throws(
    () => assertAdapterActivationEvidence(evidence),
    hasCode('LORA_BENCHMARK_FAILED'),
  );
});

test('learning benchmark emits exact LoRA provenance supplied for the evaluated artifact', async () => {
  const plan = makePlan();
  const artifact = makeArtifact(plan);
  const result = await runLearningBenchmark({
    cases: [{ id: 'provenance-case', domain: 'learning', weight: 1, prompt: 'ok?', rubric: { must_include: ['ok'] } }],
    respond: async () => 'ok',
    metadata: { suite_digest: SUITE_DIGEST, source_sha: 'candidate-test' },
    provenance: {
      artifact_digest: artifact.digest,
      training_manifest_digest: plan.training_manifest_digest,
      dataset_digest: plan.dataset_digest,
    },
  });
  assert.equal(result.overall, 1);
  assert.equal(result.artifact_digest, artifact.digest);
  assert.equal(result.training_manifest_digest, plan.training_manifest_digest);
  assert.equal(result.dataset_digest, plan.dataset_digest);
  assert.equal(result.suite_digest, SUITE_DIGEST);
});
