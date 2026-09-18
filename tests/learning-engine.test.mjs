import test from 'node:test';
import assert from 'node:assert/strict';
import { LearningEngine } from '../src/learning/learning-engine.js';
import { createLoraTrainingPlan, DEFAULT_LORA_BASE_MODEL, DEFAULT_LORA_RUNTIME_MODEL, CLOUDFLARE_LORA_MODEL_PAIRS } from '../src/learning/lora-plan.js';
import { chooseBestSettings, proposeNeighborSettings } from '../src/learning/inference-adaptation.js';
import { CANONICAL_LEARNING_BENCHMARK_SUITE, REQUIRED_LEARNING_BENCHMARK_DOMAINS, runLearningBenchmarkSuite } from '../src/evaluation/benchmarks.js';

class MemoryStub {
  constructor() { this.rows = []; }
  async remember(row) { this.rows.unshift(structuredClone(row)); return structuredClone(row); }
  async recent({ limit = 12, kind = null, outcome = null } = {}) { return this.rows.filter(x => !kind || x.kind === kind).filter(x => !outcome || x.outcome === outcome).slice(0, limit).map(x => structuredClone(x)); }
}

const digest = 'sha256:' + 'a'.repeat(64);
const suite = 'suite-fixture-v1';
const validArtifact = (plan, overrides = {}) => ({
  id: 'mel-adapter-1',
  finetune_id: 'ft-mel-adapter-1',
  digest,
  base_model: plan?.base_model || DEFAULT_LORA_BASE_MODEL,
  runtime_model: plan?.runtime_model || DEFAULT_LORA_RUNTIME_MODEL,
  runtime: plan?.runtime || 'cloudflare-workers-ai',
  size_bytes: 1024,
  rank: plan?.rank || 8,
  format: 'safetensors',
  dataset_digest: plan?.dataset_digest || 'fnv1a-12345678',
  training_manifest_digest: plan?.training_manifest_digest,
  ...overrides,
});
const validApproval = (plan, artifact, overrides = {}) => ({
  approved: true,
  approval_id: 'approval-engine-test',
  artifact_id: artifact.id,
  artifact_digest: artifact.digest,
  finetune_id: artifact.finetune_id,
  dataset_digest: plan.dataset_digest,
  training_manifest_digest: plan.training_manifest_digest,
  ...overrides,
});
const scores = (plan, artifact, baseline = 0.7, candidate = 0.8) => ({
  baseline: { overall: baseline, domains: { code: baseline }, suite_digest: suite, passed: true },
  candidate: {
    overall: candidate,
    domains: { code: candidate },
    suite_digest: suite,
    passed: true,
    artifact_digest: artifact.digest,
    training_manifest_digest: plan.training_manifest_digest,
    dataset_digest: plan.dataset_digest,
    approval_id: 'approval-engine-test',
  },
});

test('corrections become cumulative persistent training pairs', async () => {
  const engine = new LearningEngine({ memory: new MemoryStub() });
  await engine.recordCorrection({ id: 'learn-1', domain: 'coding', input: 'Pourquoi le test ne passe pas ?', before: 'Le code métier est faux.', after: 'Le runner ne découvre pas le test imbriqué.', rationale: 'Le runner ne lit que la racine de tests.', validated: true, quality: 0.95 });
  const bundle = await engine.trainingBundle();
  assert.ok(bundle.accepted >= 4);
  const learned = bundle.preference.find(row => row.id === 'learn-1'); assert.ok(learned); assert.equal(learned.chosen, 'Le runner ne découvre pas le test imbriqué.'); assert.equal(learned.rejected, 'Le code métier est faux.'); assert.match(bundle.digest, /^fnv1a-/);
});

test('bootstrap corpus can grow beyond the 50-example LoRA readiness threshold', async () => {
  const memory = new MemoryStub();
  const engine = new LearningEngine({ memory });

  const bootstrap = await engine.trainingBundle();
  assert.ok(bootstrap.accepted >= 50, 'bootstrap must expose at least the 50 validated examples required for LoRA readiness');
  assert.equal(new Set(bootstrap.sft.map(row => row.id)).size, bootstrap.accepted);
  assert.equal(bootstrap.sft.length, bootstrap.accepted);
  assert.equal(bootstrap.preference.length, bootstrap.accepted);

  const prepared = await engine.prepareLora({ base_model: DEFAULT_LORA_BASE_MODEL });
  assert.equal(prepared.corpus.accepted, bootstrap.accepted);
  assert.equal(prepared.plan.examples, bootstrap.accepted);
  assert.equal(prepared.plan.readiness.min_examples, 50);
  assert.equal(prepared.plan.readiness.enough_examples, true);
  assert.equal(prepared.plan.readiness.cloudflare_inference_compatible, true);
  assert.equal(prepared.plan.readiness.ready_for_training, true);
  assert.equal(prepared.plan.status, 'READY_FOR_TRAINING');
  assert.equal((await memory.recent({ kind: 'LORA_PLAN' }))[0].outcome, 'READY');

  await engine.recordCorrection({
    id: 'post-bootstrap-proof',
    domain: 'coding',
    input: 'validated extra input',
    before: 'incorrect extra answer',
    after: 'corrected extra answer',
    rationale: 'validated extra reason',
    validated: true,
    quality: 0.9,
  });
  const expanded = await engine.trainingBundle();
  assert.equal(expanded.accepted, bootstrap.accepted + 1, 'runtime corrections remain cumulative above the readiness threshold');
});

test('benchmark report measures gain without pretending weights changed', async () => {
  const engine = new LearningEngine({ memory: new MemoryStub() });
  await engine.recordBenchmark({ kind: 'baseline', cases: [{ id: 'a', domain: 'memory', score: 0.5 }, { id: 'b', domain: 'code', score: 0.6 }] });
  await engine.recordBenchmark({ kind: 'candidate', cases: [{ id: 'a', domain: 'memory', score: 0.7 }, { id: 'b', domain: 'code', score: 0.8 }] });
  const report = await engine.report(); assert.ok(report.benchmark.absolute_gain > 0); assert.equal(report.neural_weights_changed, false);
});

test('canonical learning benchmark covers required domains and persists first baseline once', async () => {
  const memory = new MemoryStub(); const engine = new LearningEngine({ memory });
  const evaluator = async row => ({ score: row.domain === 'taught_error_correction' ? 0.75 : 0.8, repeated_error: false, evidence: { case_id: row.id } });
  const direct = await runLearningBenchmarkSuite({ evaluator }); assert.equal(direct.results.length, CANONICAL_LEARNING_BENCHMARK_SUITE.length); assert.deepEqual(new Set(Object.keys(direct.domains)), new Set(REQUIRED_LEARNING_BENCHMARK_DOMAINS));
  const first = await engine.runCanonicalBenchmark({ kind: 'baseline', evaluator, model_id: 'fixture/model', source_sha: 'a'.repeat(40) });
  const second = await engine.runCanonicalBenchmark({ kind: 'baseline', evaluator, model_id: 'fixture/model', source_sha: 'b'.repeat(40) });
  assert.equal(first.reused, false); assert.equal(second.reused, true); assert.equal((await memory.recent({ kind: 'LEARNING_BENCHMARK' })).length, 1); assert.equal((await engine.report()).repeated_taught_errors, 0);
});

test('canonical learning benchmark counts repeated taught errors explicitly', async () => {
  const engine = new LearningEngine({ memory: new MemoryStub() });
  await engine.runCanonicalBenchmark({ kind: 'candidate', evaluator: async row => ({ score: row.domain === 'taught_error_correction' ? 0.2 : 0.8, repeated_error: row.domain === 'taught_error_correction' }) });
  assert.equal((await engine.report()).repeated_taught_errors, 1);
});

test('adaptive settings reduce randomness after precision failures', () => {
  const next = proposeNeighborSettings({ temperature: 0.5, top_p: 0.9, review_passes: 1 }, { errors: ['hallucination', 'precision'] }); assert.ok(next.temperature < 0.5); assert.ok(next.top_p < 0.9); assert.equal(next.review_passes, 2);
});

test('settings promotion requires enough measured trials and gain', () => {
  const current = { temperature: 0.4, top_p: 0.9, max_tokens: 4096, memory_results: 12, review_passes: 1, council_min_responses: 2 }; const candidate = { ...current, temperature: 0.3 };
  const trials = [{ settings: current, score: 0.70 }, { settings: current, score: 0.71 }, { settings: current, score: 0.69 }, { settings: candidate, score: 0.77 }, { settings: candidate, score: 0.76 }, { settings: candidate, score: 0.78 }];
  const decision = chooseBestSettings(trials, { current, minimumTrials: 3, minimumGain: 0.02 }); assert.equal(decision.promote, true); assert.equal(decision.candidate.temperature, 0.3);
});

test('measured inference settings are promoted only after persisted comparable trials', async () => {
  const memory = new MemoryStub(); const engine = new LearningEngine({ memory }); const current = { temperature: 0.4, top_p: 0.9, max_tokens: 4096, memory_results: 12, review_passes: 1, council_min_responses: 2 }; const candidate = { ...current, temperature: 0.3 };
  for (const score of [0.70,0.71,0.69]) await engine.recordInferenceTrial({ settings: current, score, case_id: 'stable-case' }); let decision = await engine.promoteMeasuredInferenceSettings({ current }); assert.equal(decision.promoted, false);
  for (const score of [0.77,0.76,0.78]) await engine.recordInferenceTrial({ settings: candidate, score, case_id: 'stable-case' }); decision = await engine.promoteMeasuredInferenceSettings({ current, evidence: { protocol: 'stable-comparison' } }); assert.equal(decision.promoted, true); assert.equal(decision.settings.temperature, 0.3); assert.equal((await memory.recent({ kind: 'INFERENCE_SETTINGS' })).length, 1); assert.equal((await engine.report()).inference_trials, 6);
});

test('LoRA remains draft until corpus is large enough and uses a supported Workers AI pair', () => {
  const early = createLoraTrainingPlan({ dataset_digest: 'fnv1a-12345678', examples: 12 }); const ready = createLoraTrainingPlan({ dataset_digest: 'fnv1a-12345678', examples: 80 });
  assert.equal(early.status, 'DRAFT'); assert.equal(early.readiness.ready_for_training, false); assert.equal(ready.status, 'READY_FOR_TRAINING'); assert.equal(ready.readiness.ready_for_training, true); assert.equal(ready.readiness.base_weights_frozen, true); assert.equal(ready.base_model, DEFAULT_LORA_BASE_MODEL); assert.equal(ready.runtime_model, DEFAULT_LORA_RUNTIME_MODEL);
});

test('LoRA cannot be forced ready with an incompatible runtime configuration', () => {
  const plan = createLoraTrainingPlan({ dataset_digest: 'fnv1a-12345678', examples: 80, quantization: '4bit', status: 'READY_FOR_TRAINING' }); assert.equal(plan.readiness.enough_examples, true); assert.equal(plan.readiness.cloudflare_inference_compatible, false); assert.equal(plan.readiness.ready_for_training, false); assert.equal(plan.status, 'DRAFT');
});

test('prepareLora reports runtime incompatibility instead of READY', async () => {
  const memory = new MemoryStub(); const engine = new LearningEngine({ memory });
  for (let i=0;i<55;i++) await engine.recordCorrection({ id:`compat-${i}`, domain:'coding', input:`input ${i}`, before:`bad ${i}`, after:`good ${i}`, rationale:`reason ${i}`, validated:true, quality:0.9 });
  const result = await engine.prepareLora({ base_model: DEFAULT_LORA_BASE_MODEL, quantization: '4bit' }); assert.equal(result.plan.readiness.enough_examples, true); assert.equal(result.plan.readiness.cloudflare_inference_compatible, false); assert.equal((await memory.recent({ kind:'LORA_PLAN' }))[0].outcome, 'BLOCKED_EXTERNAL');
});

test('adapter cannot become active without a measured benchmark gain', async () => {
  const memory = new MemoryStub(); const engine = new LearningEngine({ memory }); const plan = createLoraTrainingPlan({ dataset_digest:'fnv1a-12345678', examples:80 }); const artifact = validArtifact(plan); const { baseline, candidate } = scores(plan, artifact, 0.8, 0.79);
  await assert.rejects(() => engine.activateAdapter({ plan, artifact, approval: validApproval(plan, artifact), baseline, candidate }), error => error.code === 'LORA_MEASURED_GAIN_INSUFFICIENT'); assert.equal((await memory.recent({ kind:'LORA_ADAPTER_ACTIVE' })).length,0);
});

test('adapter activation rejects incompatible plan even after benchmark gain', async () => {
  const engine = new LearningEngine({ memory:new MemoryStub() }); const plan = createLoraTrainingPlan({ dataset_digest:'fnv1a-12345678', examples:80, quantization:'4bit' }); const artifact = validArtifact(plan); const { baseline, candidate } = scores(plan, artifact);
  await assert.rejects(() => engine.activateAdapter({ plan, artifact, baseline, candidate }), error => error.code === 'LORA_PLAN_NOT_ACTIVATABLE');
});

test('adapter activation rejects base-model mismatch', async () => {
  const engine = new LearningEngine({ memory:new MemoryStub() }); const plan = createLoraTrainingPlan({ dataset_digest:'fnv1a-12345678', examples:80 }); const baseArtifact = validArtifact(plan); const { baseline, candidate } = scores(plan, baseArtifact);
  const otherBase='google/gemma-7b-it'; const otherRuntime=CLOUDFLARE_LORA_MODEL_PAIRS[otherBase]; const artifact=validArtifact(plan, { id:'mel-adapter-gemma', base_model:otherBase, runtime_model:otherRuntime });
  await assert.rejects(() => engine.activateAdapter({ plan, artifact, baseline, candidate }), error => error.code === 'LORA_BASE_MODEL_MISMATCH');
});
