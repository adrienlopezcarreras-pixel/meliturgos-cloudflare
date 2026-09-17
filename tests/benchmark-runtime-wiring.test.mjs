import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveRuntimeBenchmarkEvaluator } from '../src/evolution/autonomy-runtime.js';
import { DEFAULT_OPERATOR_BENCHMARK_MODEL } from '../src/learning/operator-actions.js';

test('runtime benchmark evaluator preserves an explicitly injected evaluator', () => {
  const evaluator = async () => ({ score: 1 });
  const resolved = resolveRuntimeBenchmarkEvaluator({}, {
    benchmarkEvaluator: evaluator,
    benchmarkModelId: '@cf/test-model',
  });
  assert.equal(resolved.evaluator, evaluator);
  assert.equal(resolved.model_id, '@cf/test-model');
  assert.equal(resolved.error, null);
});

test('runtime benchmark evaluator builds the canonical zero-cost evaluator when AI is available', async () => {
  const calls = [];
  const resolved = resolveRuntimeBenchmarkEvaluator({
    AI: {
      async run(model, input) {
        calls.push({ model, input });
        return { response: '{"ok":true,"value":4}' };
      },
    },
  });
  assert.equal(resolved.error, null);
  assert.equal(resolved.model_id, DEFAULT_OPERATOR_BENCHMARK_MODEL);
  const result = await resolved.evaluator({
    id: 'instruction-following-01',
    domain: 'instruction_following',
  });
  assert.equal(result.score, 1);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].model, DEFAULT_OPERATOR_BENCHMARK_MODEL);
});

test('runtime benchmark evaluator fails closed when AI binding is unavailable', () => {
  const resolved = resolveRuntimeBenchmarkEvaluator({});
  assert.equal(resolved.evaluator, null);
  assert.equal(resolved.model_id, '');
  assert.equal(resolved.error, 'AI_BINDING_UNAVAILABLE');
});
