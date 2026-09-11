import test from 'node:test';
import assert from 'node:assert/strict';
import { withChatAiDefaults } from '../src/index.js';

test('chat AI wrapper applies a bounded 4096 token output budget by default', async () => {
  let seen;
  const env = { AI: { async run(model, input) { seen = { model, input }; return { response: 'ok' }; } } };
  const wrapped = withChatAiDefaults(env);
  await wrapped.AI.run('@cf/example', { messages: [{ role: 'user', content: 'test' }] });
  assert.equal(seen.input.max_tokens, 4096);
});

test('chat AI wrapper honors configured budget within bounds and preserves explicit request', async () => {
  const calls = [];
  const env = { MEL_MAX_OUTPUT_TOKENS: '9000', AI: { async run(_model, input) { calls.push(input); return { response: 'ok' }; } } };
  const wrapped = withChatAiDefaults(env);
  await wrapped.AI.run('model', { messages: [], max_tokens: 2048 });
  await wrapped.AI.run('model', { messages: [] });
  assert.equal(calls[0].max_tokens, 2048);
  assert.equal(calls[1].max_tokens, 8192);
});
