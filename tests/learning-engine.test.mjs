import test from 'node:test';
import assert from 'node:assert/strict';
import { LearningEngine } from '../src/learning/learning-engine.js';
import { createLoraTrainingPlan } from '../src/learning/lora-plan.js';
import { chooseBestSettings, proposeNeighborSettings } from '../src/learning/inference-adaptation.js';

class MemoryStub {
  constructor() { this.rows = []; }
  async remember(row) { this.rows.unshift(structuredClone(row)); return structuredClone(row); }
  async recent({ limit = 12, kind = null, outcome = null } = {}) {
    return this.rows.filter(x => !kind || x.kind === kind).filter(x => !outcome || x.outcome === outcome).slice(0, limit).map(x => structuredClone(x));
  }
}

test('corrections become cumulative persistent training pairs', async () => {
  const engine = new LearningEngine({ memory: new MemoryStub() });
  await engine.recordCorrection({
    id: 'learn-1', domain: 'coding', input: 'Pourquoi le test ne passe pas ?',
    before: 'Le code métier est faux.', after: 'Le runner ne découvre pas le test imbriqué.',
    rationale: 'Le runner ne lit que la racine de tests.', validated: true, quality: 0.95,
  });
  const bundle = await engine.trainingBundle();
  assert.ok(bundle.accepted >= 4, 'persisted correction plus verified bootstrap lessons should all be trainable');
  const learned = bundle.preference.find(row => row.id === 'learn-1');
  assert.ok(learned);
  assert.equal(learned.chosen, 'Le runner ne découvre pas le test imbriqué.');
  assert.equal(learned.rejected, 'Le code métier est faux.');
  assert.match(bundle.digest, /^fnv1a-/);
});

test('benchmark report measures gain without pretending weights changed', async () => {
  const engine = new LearningEngine({ memory: new MemoryStub() });
  await engine.recordBenchmark({ kind: 'baseline', cases: [
    { id: 'a', domain: 'memory', score: 0.5 }, { id: 'b', domain: 'code', score: 0.6 },
  ] });
  await engine.recordBenchmark({ kind: 'candidate', cases: [
    { id: 'a', domain: 'memory', score: 0.7 }, { id: 'b', domain: 'code', score: 0.8 },
  ] });
  const report = await engine.report();
  assert.ok(report.benchmark.absolute_gain > 0);
  assert.equal(report.neural_weights_changed, false);
});

test('adaptive settings reduce randomness after precision failures', () => {
  const next = proposeNeighborSettings({ temperature: 0.5, top_p: 0.9, review_passes: 1 }, { errors: ['hallucination', 'precision'] });
  assert.ok(next.temperature < 0.5);
  assert.ok(next.top_p < 0.9);
  assert.equal(next.review_passes, 2);
});

test('settings promotion requires enough measured trials and gain', () => {
  const current = { temperature: 0.4, top_p: 0.9, max_tokens: 4096, memory_results: 12, review_passes: 1, council_min_responses: 2 };
  const candidate = { ...current, temperature: 0.3 };
  const trials = [
    { settings: current, score: 0.70 }, { settings: current, score: 0.71 }, { settings: current, score: 0.69 },
    { settings: candidate, score: 0.77 }, { settings: candidate, score: 0.76 }, { settings: candidate, score: 0.78 },
  ];
  const decision = chooseBestSettings(trials, { current, minimumTrials: 3, minimumGain: 0.02 });
  assert.equal(decision.promote, true);
  assert.equal(decision.candidate.temperature, 0.3);
});

test('LoRA remains draft until corpus is large enough', () => {
  const early = createLoraTrainingPlan({ base_model: 'open/model', dataset_digest: 'fnv1a-12345678', examples: 12 });
  const ready = createLoraTrainingPlan({ base_model: 'open/model', dataset_digest: 'fnv1a-12345678', examples: 80 });
  assert.equal(early.status, 'DRAFT');
  assert.equal(ready.status, 'READY_FOR_TRAINING');
  assert.equal(ready.readiness.base_weights_frozen, true);
});

test('adapter cannot become active without a measured benchmark gain', async () => {
  const memory = new MemoryStub();
  const engine = new LearningEngine({ memory });
  const plan = createLoraTrainingPlan({ base_model: 'open/model', dataset_digest: 'fnv1a-12345678', examples: 80 });
  await assert.rejects(() => engine.activateAdapter({
    plan,
    artifact: { id: 'mel-adapter-1', digest: 'sha256-adapter', base_model: 'open/model', format: 'safetensors' },
    baseline: { overall: 0.8, domains: { code: 0.8 } },
    candidate: { overall: 0.79, domains: { code: 0.79 } },
  }), error => error.code === 'LORA_ACTIVATION_DENIED');
  assert.equal((await memory.recent({ kind: 'LORA_ADAPTER_ACTIVE' })).length, 0);
});
