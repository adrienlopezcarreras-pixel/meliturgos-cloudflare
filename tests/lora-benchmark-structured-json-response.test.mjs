import test from 'node:test';
import assert from 'node:assert/strict';
import { extractOperatorBenchmarkText } from '../src/learning/operator-actions.js';
import { extractModelText } from '../src/models/ModelRouter.js';
import { scoreBenchmarkResponse, MEL_LEARNING_BENCHMARK_CASES } from '../src/learning/benchmark-suite.js';

test('structured JSON-only Workers AI completion remains valid text evidence', () => {
  const raw = { response: { ok: true, value: 4 } };
  const text = extractOperatorBenchmarkText(raw, extractModelText);
  assert.equal(text, '{"ok":true,"value":4}');
  const canonical = MEL_LEARNING_BENCHMARK_CASES.find(c => c.id === 'instruction-following-01');
  assert.ok(canonical);
  assert.equal(scoreBenchmarkResponse(text, canonical.rubric).score, 1);
});
test('ordinary and chat-text completions stay unchanged', () => {
  assert.equal(extractOperatorBenchmarkText({ response: '  bonjour  ' }), 'bonjour');
  assert.equal(extractOperatorBenchmarkText({ choices:[{ message: { content: '  salut ' } }] }), 'salut');
});
test('empty, array, null and unusable structured results fail closed', () => {
  for(const raw of [null, undefined, {}, {response:{}}, {response:[]}, {response:[]}, {response:'   '}]) {
    assert.throws(() => extractOperatorBenchmarkText(raw), /empty_benchmark_response/);
  }
  const cyclic = {}; cyclic.self = cyclic;
  assert.throws(() => extractOperatorBenchmarkText({ response:cyclic }), /empty_benchmark_response/);
  const huge = { repeated:'x'.repeat(20000) };
  assert.throws(() => extractOperatorBenchmarkText({ response:huge }), /empty_benchmark_response/);
});
test('a structured benchmark response is never classified as LoRA activation', () => {
  const raw = { response: { ok:true,value:4 } };
  const text = extractOperatorBenchmarkText(raw);
  assert.equal(typeof text,'string');
  assert.doesNotMatch(text,/finetune_id|lora_applied/);
});
