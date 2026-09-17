import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_OPERATOR_BENCHMARK_MODEL,
  ensureZeroCostBenchmarkBaseline,
  prepareOperatorLora,
  runOperatorBenchmark,
} from '../src/learning/operator-actions.js';

test('operator benchmark fails closed when Workers AI is unavailable', async () => {
  await assert.rejects(
    () => runOperatorBenchmark({}, {}, {}),
    (error) => error?.code === 'AI_BINDING_UNAVAILABLE' && error?.message === 'ai_binding_unavailable',
  );
});

test('operator benchmark executes model cases and persists measured evidence', async () => {
  const aiCalls = [];
  const recorded = [];
  const engine = {
    async recordBenchmark(value) {
      recorded.push(value);
      return { id: 'benchmark-memory-1', ...value };
    },
  };

  const result = await runOperatorBenchmark(
    {
      AI: {
        async run(model, request) {
          aiCalls.push({ model, request });
          return { response: '42' };
        },
      },
      MEL_SOURCE_SHA: 'source-sha-123',
    },
    {},
    {
      createLearningEngine: () => engine,
      runLearningBenchmark: async ({ respond, modelId, sourceSha, metadata }) => {
        const output = await respond('Réponds 42.');
        return {
          benchmark_id: `test:${sourceSha}:${modelId}`,
          version: 'test-v1',
          model_id: modelId,
          source_sha: sourceSha,
          metadata,
          case_count: 1,
          score: 1,
          cases: [{ id: 'case-1', domain: 'reasoning', output, weight: 1, score: 1 }],
        };
      },
    },
  );

  assert.equal(result.model_id, DEFAULT_OPERATOR_BENCHMARK_MODEL);
  assert.equal(result.source_sha, 'source-sha-123');
  assert.equal(result.benchmark.score, 1);
  assert.equal(result.benchmark.metadata.source_sha, 'source-sha-123');
  assert.equal(result.benchmark.metadata.model_id, DEFAULT_OPERATOR_BENCHMARK_MODEL);
  assert.equal(aiCalls.length, 1);
  assert.equal(aiCalls[0].model, DEFAULT_OPERATOR_BENCHMARK_MODEL);
  assert.equal(aiCalls[0].request.temperature, 0);
  assert.equal(recorded.length, 1);
  assert.equal(recorded[0].kind, 'operator');
  assert.equal(recorded[0].model_id, DEFAULT_OPERATOR_BENCHMARK_MODEL);
  assert.equal(recorded[0].source_sha, 'source-sha-123');
  assert.equal(recorded[0].metadata.trigger, 'professor');
  assert.equal(recorded[0].metadata.measured_score, 1);
});

test('operator benchmark honors only a configured model that is explicitly zero-cost', async () => {
  const models = [];
  const engine = { async recordBenchmark(value) { return value; } };
  const configuredModel = '@cf/google/gemma-3-12b-it';
  const result = await runOperatorBenchmark(
    {
      AI: { async run(model) { models.push(model); return { response: 'ok' }; } },
      MEL_BENCHMARK_MODEL: configuredModel,
    },
    { model_id: '@cf/ignored/request-selected-model' },
    {
      createLearningEngine: () => engine,
      runLearningBenchmark: async ({ respond, modelId, sourceSha }) => ({
        benchmark_id: 'configured', version: 'test', model_id: modelId, source_sha: sourceSha,
        case_count: 1, score: 1,
        cases: [{ id: 'case', score: 1, weight: 1, output: await respond('ok') }],
      }),
    },
  );

  assert.equal(result.model_id, configuredModel);
  assert.deepEqual(models, [configuredModel]);
});

test('operator benchmark rejects an unknown or non-verified-cost configured model before calling AI', async () => {
  let called = false;
  await assert.rejects(
    () => runOperatorBenchmark({
      AI: { async run() { called = true; return { response: 'should-not-run' }; } },
      MEL_BENCHMARK_MODEL: '@cf/example/unknown-cost-model',
    }),
    (error) => error?.code === 'BENCHMARK_MODEL_NOT_VERIFIED_ZERO_COST',
  );
  assert.equal(called, false);
});

test('LoRA preparation persists a plan and explicitly reports that no trainer is configured', async () => {
  const inputs = [];
  const engine = {
    async prepareLora(input) {
      inputs.push(input);
      return {
        plan: { id: 'lora-plan-1', status: 'READY', examples: 25 },
        corpus: { accepted: 25, rejected: 2, digest: 'digest-1' },
      };
    },
  };

  const result = await prepareOperatorLora(
    { MEL_LORA_BASE_MODEL: '@cf/example/lora-base' },
    { min_quality: 0.72 },
    { createLearningEngine: () => engine },
  );

  assert.deepEqual(inputs, [{ base_model: '@cf/example/lora-base', minQuality: 0.72 }]);
  assert.equal(result.plan.status, 'READY');
  assert.equal(result.trainer.available, false);
  assert.equal(result.trainer.status, 'NOT_CONFIGURED');
  assert.match(result.trainer.reason, /Aucun exécuteur/);
});

test('LoRA quality input is clamped before reaching the learning engine', async () => {
  let received;
  const engine = {
    async prepareLora(input) {
      received = input;
      return { plan: { status: 'BLOCKED_DATA' }, corpus: {} };
    },
  };

  await prepareOperatorLora({}, { min_quality: 9 }, { createLearningEngine: () => engine });
  assert.equal(received.minQuality, 1);
});


test('baseline bootstrap runs the canonical suite once when the current suite has no baseline', async () => {
  let received = null;
  const engine = {
    async benchmarks() { return []; },
    async runCanonicalBenchmark(value) {
      received = value;
      return {
        reused: false,
        score: { overall: 0.75, cases: 7 },
        suite_digest: 'suite-current',
      };
    },
  };
  const result = await ensureZeroCostBenchmarkBaseline(
    {
      AI: { async run() { return { response: 'unused-by-stub-engine' }; } },
      MEL_SOURCE_SHA: 'bootstrap-source-sha',
    },
    { trigger: 'test-bootstrap' },
    { createLearningEngine: () => engine },
  );
  assert.equal(result.status, 'RAN');
  assert.equal(result.created, true);
  assert.equal(result.score, 0.75);
  assert.equal(result.cases, 7);
  assert.equal(result.model_id, DEFAULT_OPERATOR_BENCHMARK_MODEL);
  assert.equal(result.source_sha, 'bootstrap-source-sha');
  assert.equal(received.kind, 'baseline');
  assert.equal(received.model_id, DEFAULT_OPERATOR_BENCHMARK_MODEL);
  assert.equal(received.source_sha, 'bootstrap-source-sha');
  assert.equal(received.metadata.trigger, 'test-bootstrap');
  assert.equal(typeof received.evaluator, 'function');
});

test('baseline bootstrap reuses a persisted baseline for the current canonical suite without calling AI', async () => {
  const { CANONICAL_LEARNING_BENCHMARK_SUITE, benchmarkSuiteFingerprint } = await import('../src/evaluation/benchmarks.js');
  const suiteDigest = benchmarkSuiteFingerprint(CANONICAL_LEARNING_BENCHMARK_SUITE);
  let aiCalled = false;
  let runCalled = false;
  const engine = {
    async benchmarks() {
      return [{
        kind: 'baseline',
        overall: 0.82,
        cases: 7,
        model_id: 'persisted-model',
        source_sha: 'persisted-sha',
        metadata: { suite_digest: suiteDigest },
      }];
    },
    async runCanonicalBenchmark() { runCalled = true; throw new Error('should_not_run'); },
  };
  const result = await ensureZeroCostBenchmarkBaseline(
    { AI: { async run() { aiCalled = true; return { response: 'no' }; } } },
    {},
    { createLearningEngine: () => engine },
  );
  assert.equal(result.status, 'EXISTS');
  assert.equal(result.created, false);
  assert.equal(result.score, 0.82);
  assert.equal(result.suite_digest, suiteDigest);
  assert.equal(aiCalled, false);
  assert.equal(runCalled, false);
});
