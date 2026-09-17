import test from 'node:test';
import assert from 'node:assert/strict';
import { createLoraTrainingPlan, assertAdapterArtifactForPlan } from '../src/learning/lora-plan.js';
import { decideAdapterPromotion } from '../src/learning/correction-corpus.js';
import { runOperatorLoraBenchmark } from '../src/learning/operator-actions.js';
import { createNativeModelRouter } from '../src/api/native-chat.js';

const DATASET = 'sha256:' + '1'.repeat(64);
const ARTIFACT = 'sha256:' + '2'.repeat(64);

function exactPlan() {
  return createLoraTrainingPlan({
    id: 'mel-lora-test',
    dataset_digest: DATASET,
    examples: 500,
    rank: 8,
    alpha: 16,
    dropout: 0.05,
    learning_rate: 2e-4,
    epochs: 1,
    seed: 42,
    quantization: 'none',
    status: 'READY_FOR_TRAINING',
  });
}

function exactArtifact(plan) {
  return {
    id: 'artifact-test',
    finetune_id: 'ft-test-123',
    digest: ARTIFACT,
    base_model: plan.base_model,
    runtime_model: plan.runtime_model,
    runtime: plan.runtime,
    size_bytes: 1024,
    rank: plan.rank,
    format: 'safetensors',
    dataset_digest: plan.dataset_digest,
    training_manifest_digest: plan.training_manifest_digest,
  };
}

test('LoRA artifact must carry exact plan provenance and Cloudflare finetune id', () => {
  const plan = exactPlan();
  const artifact = exactArtifact(plan);
  const checked = assertAdapterArtifactForPlan({ plan, artifact });
  assert.equal(checked.finetune_id, 'ft-test-123');
  assert.equal(checked.training_manifest_digest, plan.training_manifest_digest);

  assert.throws(
    () => assertAdapterArtifactForPlan({ plan, artifact: { ...artifact, finetune_id: null } }),
    (error) => error?.code === 'LORA_FINETUNE_ID_REQUIRED',
  );
  assert.throws(
    () => assertAdapterArtifactForPlan({ plan, artifact: { ...artifact, dataset_digest: 'sha256:' + '3'.repeat(64) } }),
    (error) => error?.code === 'LORA_DATASET_MISMATCH',
  );
});

test('domain regression gate reads structured benchmark domain scores', () => {
  const decision = decideAdapterPromotion({
    baseline: { overall: 0.5, domains: { code: { score: 0.9, cases: 1 } } },
    candidate: { overall: 0.7, domains: { code: { score: 0.4, cases: 1 } } },
  });
  assert.equal(decision.promote, false);
  assert.equal(decision.reason, 'DOMAIN_REGRESSION');
});

test('operator LoRA benchmark calls base first and exact finetune second', async () => {
  const plan = exactPlan();
  const artifact = exactArtifact(plan);
  const calls = [];
  const ai = {
    run: async (model, input) => {
      calls.push({ model, input: structuredClone(input) });
      return { response: 'ok' };
    },
  };
  let run = 0;
  const benchmarkRunner = async ({ respond, metadata, provenance = {} }) => {
    await respond('test prompt');
    run += 1;
    const overall = run === 1 ? 0.5 : 0.7;
    return {
      benchmark_id: 'bench-' + run,
      suite_digest: metadata.suite_digest,
      cases: [{ id: 'case', domain: 'general', score: overall, weight: 1, error: null }],
      case_count: 1,
      score: overall,
      overall,
      domains: { general: { score: overall, cases: 1 } },
      provenance,
      artifact_digest: provenance.artifact_digest || '',
      training_manifest_digest: provenance.training_manifest_digest || '',
      dataset_digest: provenance.dataset_digest || '',
    };
  };
  const recorded = [];
  const engine = {
    recordBenchmark: async (row) => { recorded.push(row); return { score: { overall: row.cases[0].score } }; },
    evaluateAdapter: async () => ({ promote: true, reason: 'BENCHMARK_IMPROVED' }),
    activateAdapter: async () => ({ plan_id: plan.id, finetune_id: artifact.finetune_id }),
  };

  const result = await runOperatorLoraBenchmark({}, { plan, artifact, activate: true }, {
    ai,
    runLearningBenchmark: benchmarkRunner,
    createLearningEngine: () => engine,
    extractModelText: (value) => value.response,
  });

  assert.equal(calls.length, 2);
  assert.equal(calls[0].model, plan.runtime_model);
  assert.equal(calls[0].input.lora, undefined);
  assert.equal(calls[1].model, plan.runtime_model);
  assert.equal(calls[1].input.lora, artifact.finetune_id);
  assert.equal(recorded.length, 2);
  assert.equal(result.activated, true);
});

test('native model router prioritizes and applies the active LoRA adapter', async () => {
  const plan = exactPlan();
  const artifact = exactArtifact(plan);
  const calls = [];
  const env = {
    AI: {
      run: async (model, input) => {
        calls.push({ model, input: structuredClone(input) });
        return { response: 'LoRA response' };
      },
    },
  };
  const router = createNativeModelRouter(env, null, {
    plan_id: plan.id,
    runtime_model: plan.runtime_model,
    finetune_id: artifact.finetune_id,
    adapter: artifact,
  });
  const result = await router.execute({
    task: 'GENERAL',
    messages: [{ role: 'user', content: 'bonjour' }],
  });
  assert.equal(result.text, 'LoRA response');
  assert.equal(calls[0].model, plan.runtime_model);
  assert.equal(calls[0].input.lora, artifact.finetune_id);
});
