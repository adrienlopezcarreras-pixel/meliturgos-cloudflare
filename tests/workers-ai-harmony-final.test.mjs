import test from 'node:test';
import assert from 'node:assert/strict';
import { harmonyFinal } from '../src/augmentio/workers-ai-adapter.js';

test('gpt-oss harmony channels: only the final answer is kept', () => {
  assert.equal(harmonyFinal('plain answer'), 'plain answer');
  assert.equal(harmonyFinal('<|channel|>analysis<|message|>thinking...<|end|><|start|>assistant<|channel|>final<|message|>SUMMARY ok<|return|>'), 'SUMMARY ok');
  assert.equal(harmonyFinal('<|channel|>analysis: The assistant responded with a partial analysis'), '');
});

test('literal channel markers inside a complete JSON answer are data', () => {
  const answer = JSON.stringify({ verdict: 'REJECT', blocking: ['Incorrect use of <|channel|>final'], summary: 'A real blocking review.' });
  assert.equal(harmonyFinal(answer), answer);
});

test('a final JSON answer may quote channel and termination markers without being truncated', () => {
  const answer = JSON.stringify({ verdict: 'REJECT', blocking: ['Check <|channel|>final<|message|> and <|return|> handling'], summary: 'Protocol regression.' });
  const trace = '<|channel|>analysis<|message|>reviewing\n<|channel|>final<|message|>' + answer + '<|return|>';
  assert.equal(harmonyFinal(trace), answer);
});
