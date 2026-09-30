import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ModelRegistry } from '../../src/models/ModelRegistry.js';
import { ModelRouter } from '../../src/models/ModelRouter.js';
import {
  D1ModelPerformanceStore,
  InMemoryModelPerformanceStore,
  modelPerformanceConfidence,
  modelPerformanceScore,
  modelTaskQualityFromBenchmark,
} from '../../src/models/model-performance-store.js';
import { LearningEngine, createLearningEngine } from '../../src/learning/learning-engine.js';
import { sqliteD1 } from '../helpers/sqlite-d1.mjs';

function registry() {
  return new ModelRegistry([
    { id: 'static-primary', provider: 'test', capabilities: ['GENERAL'], priority: 30, cost: 0 },
    { id: 'learned-fast', provider: 'test', capabilities: ['GENERAL'], priority: 20, cost: 0 },
    { id: 'fallback', provider: 'test', capabilities: ['GENERAL'], priority: 10, cost: null },
  ]);
}

test('no evidence keeps static model ordering unchanged', async () => {
  const store = new InMemoryModelPerformanceStore();
  const models = registry().modelsByCapability('GENERAL');
  assert.deepEqual((await store.rank(models, 'GENERAL')).map(row => row.id), [
    'static-primary',
    'learned-fast',
    'fallback',
  ]);
});

test('weak evidence only nudges ranking while strong evidence can change the primary model', async () => {
  const store = new InMemoryModelPerformanceStore([
    {
      model_id: 'learned-fast',
      task: 'GENERAL',
      samples: 3,
      successes: 3,
      failures: 0,
      avg_latency_ms: 150,
    },
  ]);
  const models = registry().modelsByCapability('GENERAL');
  assert.equal((await store.rank(models, 'GENERAL'))[0].id, 'static-primary');

  for (let i = 0; i < 20; i++) {
    await store.recordAttempt({ modelId: 'learned-fast', task: 'GENERAL', ok: true, latencyMs: 100 });
    await store.recordAttempt({ modelId: 'static-primary', task: 'GENERAL', ok: false, latencyMs: 5000 });
  }

  const ranked = await store.rank(models, 'GENERAL');
  assert.equal(ranked[0].id, 'learned-fast');
});

test('benchmark quality contributes to evidence and confidence', async () => {
  const store = new InMemoryModelPerformanceStore();
  for (let i = 0; i < 8; i++) {
    await store.recordBenchmark({ modelId: 'learned-fast', task: 'GENERAL', quality: 0.95 });
  }
  const rows = await store.list('GENERAL');
  const stats = rows.find(row => row.model_id === 'learned-fast');
  const model = registry().get('learned-fast');
  assert.ok(modelPerformanceScore(model, stats) > 0.8);
  assert.equal(modelPerformanceConfidence(stats), 1);
});

test('ModelRouter selects evidence-ranked candidate and records execution outcome', async () => {
  const store = new InMemoryModelPerformanceStore();
  for (let i = 0; i < 20; i++) {
    await store.recordAttempt({ modelId: 'learned-fast', task: 'GENERAL', ok: true, latencyMs: 80 });
    await store.recordAttempt({ modelId: 'static-primary', task: 'GENERAL', ok: false, latencyMs: 4000 });
  }

  const invoked = [];
  const router = new ModelRouter({
    registry: registry(),
    performanceStore: store,
    maxCalls: 2,
    invoke: async selected => {
      invoked.push(selected.id);
      return { response: 'ok' };
    },
  });

  const result = await router.execute({ task: 'GENERAL', messages: [{ role: 'user', content: 'hello' }] });
  assert.equal(result.model, 'learned-fast');
  assert.deepEqual(invoked, ['learned-fast']);

  const stats = (await store.list('GENERAL')).find(row => row.model_id === 'learned-fast');
  assert.equal(stats.successes, 21);
});

test('explicit model choice is never overridden by learned ranking', async () => {
  const store = new InMemoryModelPerformanceStore();
  for (let i = 0; i < 20; i++) {
    await store.recordAttempt({ modelId: 'learned-fast', task: 'GENERAL', ok: true, latencyMs: 50 });
  }
  const invoked = [];
  const router = new ModelRouter({
    registry: registry(),
    performanceStore: store,
    invoke: async selected => {
      invoked.push(selected.id);
      return { response: 'ok' };
    },
  });
  const result = await router.execute({
    task: 'GENERAL',
    model: 'static-primary',
    messages: [{ role: 'user', content: 'hello' }],
  });
  assert.equal(result.model, 'static-primary');
  assert.equal(invoked[0], 'static-primary');
});

test('D1 performance store persists attempts and benchmark quality by task', async () => {
  const db = sqliteD1();
  try {
    const first = new D1ModelPerformanceStore(db);
    await first.recordAttempt({ modelId: 'm1', task: 'FAST', ok: true, latencyMs: 120 });
    await first.recordAttempt({ modelId: 'm1', task: 'FAST', ok: false, latencyMs: 360 });
    await first.recordBenchmark({ modelId: 'm1', task: 'FAST', quality: 0.8 });
    await first.recordBenchmark({ modelId: 'm1', task: 'FAST', quality: 1 });

    const second = new D1ModelPerformanceStore(db);
    const rows = await second.list('FAST');
    assert.equal(rows.length, 1);
    assert.equal(Number(rows[0].samples), 2);
    assert.equal(Number(rows[0].successes), 1);
    assert.equal(Number(rows[0].failures), 1);
    assert.equal(Number(rows[0].avg_latency_ms), 240);
    assert.equal(Number(rows[0].benchmark_samples), 2);
    assert.equal(Number(rows[0].quality_score), 0.9);
  } finally {
    db.close();
  }
});

test('performance store failures never block model execution', async () => {
  const router = new ModelRouter({
    registry: registry(),
    performanceStore: {
      async rank() { throw new Error('DB_DOWN'); },
      async recordAttempt() { throw new Error('DB_DOWN'); },
    },
    invoke: async selected => ({ response: selected.id }),
  });
  const result = await router.execute({ task: 'GENERAL', messages: [] });
  assert.equal(result.model, 'static-primary');
  assert.equal(result.text, 'static-primary');
});


test('canonical benchmark domains map to routing task quality without inventing FAST evidence', () => {
  const mapped = modelTaskQualityFromBenchmark({
    overall: 0.8,
    domains: {
      instruction_following: { score: 0.9 },
      code_development: { score: 0.7 },
      memory_provenance: { score: 0.8 },
      taught_error_correction: { score: 0.6 },
      tool_model_selection: { score: 1 },
      multi_step_autonomy: { score: 0.8 },
      non_regression: { score: 0.9 },
    },
  });
  const byTask = new Map(mapped.map(row => [row.task, row.quality]));
  assert.equal(byTask.get('GENERAL'), 0.8);
  assert.equal(byTask.get('CODE'), 0.7);
  assert.equal(byTask.get('STEERABLE'), 0.9);
  assert.equal(byTask.get('REASONING'), 0.82);
  assert.equal(byTask.has('FAST'), false);
});

test('LearningEngine records real benchmark quality into routing store for base model only', async () => {
  const remembered = [];
  const performanceStore = new InMemoryModelPerformanceStore();
  const memory = {
    async remember(row) { remembered.push(row); return row; },
    async recent() { return []; },
  };
  const engine = new LearningEngine({ memory, performanceStore });
  const cases = [
    { domain: 'instruction_following', score: 1, weight: 1 },
    { domain: 'code_development', score: 0.5, weight: 1 },
    { domain: 'memory_provenance', score: 0.75, weight: 1 },
    { domain: 'taught_error_correction', score: 0.75, weight: 1 },
    { domain: 'tool_model_selection', score: 0.75, weight: 1 },
    { domain: 'multi_step_autonomy', score: 0.75, weight: 1 },
    { domain: 'non_regression', score: 0.75, weight: 1 },
  ];

  const recorded = await engine.recordBenchmark({
    cases,
    kind: 'operator',
    model_id: 'base-model',
  });
  assert.equal(recorded.model_performance_recorded, true);
  assert.equal((await performanceStore.list('GENERAL')).length, 1);
  assert.equal((await performanceStore.list('CODE'))[0].quality_score, 0.5);
  assert.equal((await performanceStore.list('REASONING'))[0].quality_score, 0.75);

  const candidate = await engine.recordBenchmark({
    cases,
    kind: 'lora-candidate',
    model_id: 'base-model',
    adapter_id: 'candidate-adapter',
  });
  assert.equal(candidate.model_performance_recorded, false);
  assert.equal((await performanceStore.list('GENERAL'))[0].benchmark_samples, 1);
});

test('createLearningEngine wires D1 benchmark evidence into persistent routing performance', async () => {
  const db = sqliteD1();
  try {
    const engine = createLearningEngine({ DB: db });
    await engine.recordBenchmark({
      cases: [{ domain: 'instruction_following', score: 0.9, weight: 1 }],
      kind: 'operator',
      model_id: 'persistent-model',
    });
    const store = new D1ModelPerformanceStore(db);
    const rows = await store.list('GENERAL');
    const row = rows.find(item => item.model_id === 'persistent-model');
    assert.ok(row);
    assert.equal(Number(row.benchmark_samples), 1);
    assert.equal(Number(row.quality_score), 0.9);
  } finally {
    db.close();
  }
});
