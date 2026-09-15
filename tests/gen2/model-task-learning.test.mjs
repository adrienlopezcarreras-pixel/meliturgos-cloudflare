import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MODEL_TASK_LEARNING_SCHEMA,
  ModelTaskLearningRegistry
} from '../../src/council/model-task-learning.js';

function outcome({
  key,
  task = 'code.review',
  model = 'model-a',
  quality = 0.9,
  latency = 1000,
  cost = 0,
  success = true
}) {
  return {
    idempotencyKey: key,
    taskType: task,
    modelId: model,
    quality,
    latencyMs: latency,
    costEur: cost,
    success,
    evidence: {
      verified: true,
      source: 'benchmark-suite',
      evaluation_id: `eval-${key}`
    }
  };
}

test('records only verified outcomes and exact replays are idempotent', () => {
  const registry = new ModelTaskLearningRegistry();
  const first = registry.record(outcome({ key: 'run-1' }));
  const replay = registry.record(outcome({ key: 'run-1' }));

  assert.deepEqual(replay, first);
  assert.equal(registry.list().length, 1);

  const unverified = outcome({ key: 'run-2' });
  unverified.evidence.verified = false;
  assert.throws(() => registry.record(unverified), /MODEL_LEARNING_EVIDENCE_NOT_VERIFIED/);
});

test('idempotency conflict refuses silent replacement of evidence or metrics', () => {
  const registry = new ModelTaskLearningRegistry();
  registry.record(outcome({ key: 'run-1', quality: 0.8 }));

  assert.throws(() => registry.record(outcome({ key: 'run-1', quality: 0.81 })), /MODEL_LEARNING_IDEMPOTENCY_CONFLICT/);
});

test('summary learns quality, reliability, latency and cost by task and model', () => {
  const registry = new ModelTaskLearningRegistry();
  registry.record(outcome({ key: 'a1', quality: 0.8, latency: 1000, cost: 0, success: true }));
  registry.record(outcome({ key: 'a2', quality: 1, latency: 3000, cost: 0, success: false }));

  assert.deepEqual(registry.summary('code.review', 'model-a'), {
    task_type: 'code.review',
    model_id: 'model-a',
    samples: 2,
    successes: 1,
    reliability: 0.5,
    avg_quality: 0.9,
    avg_latency_ms: 2000,
    avg_cost_eur: 0,
    last_sequence: 2
  });
  assert.equal(registry.summary('code.review', 'unknown'), null);
});

test('default ranking is zero-cost fail-closed and remains explainable', () => {
  const registry = new ModelTaskLearningRegistry();
  for (let i = 1; i <= 3; i += 1) {
    registry.record(outcome({ key: `free-${i}`, model: 'free-model', quality: 0.88, latency: 1600 }));
    registry.record(outcome({ key: `paid-${i}`, model: 'paid-model', quality: 0.99, latency: 400, cost: 0.02 }));
  }

  const ranked = registry.rank('code.review');
  assert.deepEqual(ranked.map(row => row.model_id), ['free-model']);
  assert.equal(ranked[0].avg_cost_eur, 0);
  assert.equal(typeof ranked[0].score, 'number');
  assert.equal(typeof ranked[0].components.quality, 'number');
  assert.equal(typeof ranked[0].components.latency, 'number');
  assert.equal(registry.recommend('code.review').model_id, 'free-model');
});

test('explicit policy can compare paid models and enforce reliability, samples and allowlist', () => {
  const registry = new ModelTaskLearningRegistry();
  registry.record(outcome({ key: 'a1', model: 'a', quality: 0.9, cost: 0.01, success: true }));
  registry.record(outcome({ key: 'a2', model: 'a', quality: 0.9, cost: 0.01, success: true }));
  registry.record(outcome({ key: 'b1', model: 'b', quality: 0.98, cost: 0.01, success: false }));
  registry.record(outcome({ key: 'c1', model: 'c', quality: 1, cost: 0, success: true }));

  const ranked = registry.rank('code.review', {
    maxCostEur: 0.02,
    minReliability: 0.75,
    minSamples: 2,
    allowedModels: ['a', 'b'],
    fullConfidenceSamples: 2
  });

  assert.deepEqual(ranked.map(row => row.model_id), ['a']);
});

test('confidence penalizes a single observation until more verified evidence exists', () => {
  const registry = new ModelTaskLearningRegistry();
  registry.record(outcome({ key: 'single', model: 'single-model', quality: 1, latency: 100 }));
  for (let i = 1; i <= 5; i += 1) {
    registry.record(outcome({ key: `stable-${i}`, model: 'stable-model', quality: 0.92, latency: 600 }));
  }

  const ranked = registry.rank('code.review', { fullConfidenceSamples: 5 });
  const single = ranked.find(row => row.model_id === 'single-model');
  const stable = ranked.find(row => row.model_id === 'stable-model');
  assert.equal(single.confidence, 0.2);
  assert.equal(stable.confidence, 1);
  assert.ok(stable.score > single.score);
});

test('portable snapshot preserves learning evidence and deterministic recommendation', () => {
  const source = new ModelTaskLearningRegistry();
  source.record(outcome({ key: 'r1', task: 'research', model: 'm1', quality: 0.8, latency: 900 }));
  source.record(outcome({ key: 'r2', task: 'research', model: 'm2', quality: 0.9, latency: 800 }));

  const snapshot = source.exportSnapshot();
  assert.equal(snapshot.schema, MODEL_TASK_LEARNING_SCHEMA);

  const restored = new ModelTaskLearningRegistry({ snapshot });
  assert.deepEqual(restored.list(), source.list());
  assert.equal(restored.recommend('research').model_id, source.recommend('research').model_id);

  const broken = structuredClone(snapshot);
  broken.outcomes[1].sequence = 9;
  assert.throws(() => new ModelTaskLearningRegistry({ snapshot: broken }), /MODEL_LEARNING_SNAPSHOT_INVALID/);
});

test('invalid metrics and policies fail closed', () => {
  const registry = new ModelTaskLearningRegistry();
  assert.throws(() => registry.record(outcome({ key: 'bad-quality', quality: 1.1 })), /MODEL_LEARNING_QUALITY_INVALID/);
  assert.throws(() => registry.record(outcome({ key: 'bad-cost', cost: -1 })), /MODEL_LEARNING_COST_INVALID/);
  registry.record(outcome({ key: 'ok' }));
  assert.throws(() => registry.rank('code.review', { weights: { quality: 0, reliability: 0, latency: 0, cost: 0 } }), /MODEL_LEARNING_WEIGHTS_INVALID/);
  assert.throws(() => registry.rank('code.review', { minReliability: 2 }), /MODEL_LEARNING_MIN_RELIABILITY_INVALID/);
});
