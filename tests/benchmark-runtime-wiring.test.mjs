import test from 'node:test';
import assert from 'node:assert/strict';
import { advanceRuntimeBenchmarkCadence } from '../src/evolution/autonomy-runtime.js';
import { createZeroCostBenchmarkEvaluator, DEFAULT_OPERATOR_BENCHMARK_MODEL } from '../src/learning/operator-actions.js';

test('runtime benchmark cadence counts only reconciled verified completions', async () => {
  let captured = null;
  const evaluator = async () => ({ score: 1 });
  const state = await advanceRuntimeBenchmarkCadence({
    env: { MEL_SOURCE_SHA: 'candidate-source-sha' },
    runtimeResult: { completions: { completed: [{ id: 'a' }, { id: 'b' }], rejected: [{ id: 'x' }] } },
    deps: {
      createLearningEngine: () => ({
        advanceBenchmarkCadence: async (args) => {
          captured = args;
          return { status: 'NOT_DUE', verified_jobs_since_benchmark: args.verifiedJobsDelta };
        },
      }),
      createZeroCostBenchmarkEvaluator: () => ({ model_id: '@cf/test-zero-cost', evaluator }),
    },
  });

  assert.equal(captured.verifiedJobsDelta, 2);
  assert.equal(captured.model_id, '@cf/test-zero-cost');
  assert.equal(captured.evaluator, evaluator);
  assert.equal(captured.source_sha, 'candidate-source-sha');
  assert.equal(captured.metadata.trigger, 'autonomy-runtime');
  assert.equal(captured.metadata.completed_job_count, 2);
  assert.equal(state.verified_jobs_since_benchmark, 2);
});

test('runtime benchmark cadence does nothing when no verified completion was reconciled', async () => {
  let created = false;
  const state = await advanceRuntimeBenchmarkCadence({
    runtimeResult: { completions: { completed: [] } },
    deps: {
      createLearningEngine: () => { created = true; return {}; },
      createZeroCostBenchmarkEvaluator: () => { throw new Error('should_not_run'); },
    },
  });
  assert.equal(state, null);
  assert.equal(created, false);
});

test('runtime cadence fails closed to evaluator-unavailable while preserving completed-job count', async () => {
  let captured = null;
  const state = await advanceRuntimeBenchmarkCadence({
    env: { MEL_SOURCE_SHA: 'candidate-source-sha' },
    runtimeResult: { completions: { completed: [{ id: 'verified' }] } },
    deps: {
      createLearningEngine: () => ({
        advanceBenchmarkCadence: async (args) => {
          captured = args;
          return { status: args.evaluator ? 'RAN' : 'SKIPPED_EVALUATOR_UNAVAILABLE' };
        },
      }),
      createZeroCostBenchmarkEvaluator: () => {
        const error = new Error('ai_binding_unavailable');
        error.code = 'AI_BINDING_UNAVAILABLE';
        throw error;
      },
    },
  });
  assert.equal(captured.verifiedJobsDelta, 1);
  assert.equal(captured.evaluator, null);
  assert.equal(captured.metadata.evaluator_error, 'AI_BINDING_UNAVAILABLE');
  assert.equal(state.status, 'SKIPPED_EVALUATOR_UNAVAILABLE');
});

test('zero-cost benchmark evaluator scores canonical instruction-following fixture', async () => {
  const calls = [];
  const ai = {
    async run(model, input) {
      calls.push({ model, input });
      return { response: '{"ok":true,"value":4}' };
    },
  };
  const prepared = createZeroCostBenchmarkEvaluator({ AI: ai });
  const result = await prepared.evaluator({
    id: 'instruction-following-01',
    domain: 'instruction_following',
  });
  assert.equal(prepared.model_id, DEFAULT_OPERATOR_BENCHMARK_MODEL);
  assert.equal(result.score, 1);
  assert.equal(result.repeated_error, false);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].model, DEFAULT_OPERATOR_BENCHMARK_MODEL);
});

test('zero-cost benchmark evaluator refuses to exist without an AI binding', () => {
  assert.throws(
    () => createZeroCostBenchmarkEvaluator({}),
    (error) => error?.code === 'AI_BINDING_UNAVAILABLE',
  );
});
