import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorkersAIAdapter } from '../src/augmentio/workers-ai-adapter.js';

test('a Workers AI answer returned as a parsed JSON object reaches the caller as JSON text', async () => {
  const proposal = { summary: 'fix', edits: [{ path: 'src/a.js', find: 'a', replace: 'b' }] };
  const env = { AI: { async run() { return { response: proposal }; } } };
  const adapter = createWorkersAIAdapter({ env, modelId: '@cf/meta/llama-3.3-70b-instruct-fp8-fast' });
  const out = await adapter.invoke('propose', {});
  assert.notEqual(out.text, '[object Object]');
  assert.deepEqual(JSON.parse(out.text), proposal);
});

test('a gpt-oss answer in the Responses format reaches the caller as its output text', async () => {
  const env = { AI: { async run() { return { output: [
    { type: 'reasoning', content: [{ type: 'reasoning_text', text: 'thinking' }] },
    { type: 'message', content: [{ type: 'output_text', text: 'SUMMARY fix' }] },
  ] }; } } };
  const adapter = createWorkersAIAdapter({ env, modelId: '@cf/openai/gpt-oss-120b' });
  assert.equal((await adapter.invoke('propose', {})).text, 'SUMMARY fix');
});
