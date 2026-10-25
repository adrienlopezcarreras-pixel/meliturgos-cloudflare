import test from 'node:test';
import assert from 'node:assert/strict';
import { harmonyFinal } from '../src/augmentio/workers-ai-adapter.js';

test('gpt-oss harmony channels: only the final answer is kept', () => {
  assert.equal(harmonyFinal('plain answer'), 'plain answer');
  assert.equal(harmonyFinal('<|channel|>analysis<|message|>thinking...<|end|><|start|>assistant<|channel|>final<|message|>SUMMARY ok<|return|>'), 'SUMMARY ok');
  assert.equal(harmonyFinal('<|channel|>analysis: The assistant responded with a partial analysis'), '');
});
