import test from 'node:test';
import assert from 'node:assert/strict';
import { extractOperatorBenchmarkText } from '../src/learning/operator-actions.js';
import { runLearningBenchmark } from '../src/learning/benchmark-suite.js';

test('empty Workers AI envelopes yield bounded non-sensitive shape evidence', async () => {
  const samples = [
    [null, 'absent'],
    ['', 'blank-string'],
    [{ response: '' }, 'response-empty-or-invalid'],
    [{ choices: [] }, 'choices-empty-or-invalid'],
    [{ text: '' }, 'text-empty-or-invalid'],
    [{ opaque: { secret: 'PRIVATE_TEST_SENTINEL' } }, 'unknown-object'],
  ];
  for (const [raw, expected] of samples) {
    const result = await runLearningBenchmark({
      cases: [{ id: 'shape-01', domain: 'test', prompt: 'test', rubric: { must_include: ['ok'] } }],
      respond: async () => extractOperatorBenchmarkText(raw),
    });
    assert.equal(result.cases[0].error, 'EMPTY_BENCHMARK_RESPONSE');
    assert.equal(result.cases[0].error_shape, expected);
    assert.ok(!JSON.stringify(result.cases).includes('PRIVATE_TEST_SENTINEL'));
  }
});

test('valid structured benchmark text remains accepted', () => {
  assert.equal(extractOperatorBenchmarkText({ response: { ok: true, value: 4 } }), '{"ok":true,"value":4}');
});
