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

test('chat AI wrapper automatically continues a response stopped by token length', async () => {
  const calls = [];
  const replies = [
    { response: 'Première partie interrompue,', finish_reason: 'length' },
    { response: ' puis la réponse se termine correctement.', finish_reason: 'stop' },
  ];
  const env = {
    AI: {
      async run(_model, input) {
        calls.push(input);
        return replies.shift();
      }
    }
  };
  const wrapped = withChatAiDefaults(env);
  const result = await wrapped.AI.run('model', { messages: [{ role: 'user', content: 'Réponds longuement.' }] });
  assert.equal(calls.length, 2);
  assert.match(result.response, /Première partie interrompue/);
  assert.match(result.response, /réponse se termine correctement/);
  assert.equal(result.finish_reason, 'stop');
  assert.equal(result.mel_auto_continued, true);
  assert.equal(result.mel_continuation_segments, 2);
  assert.equal(result.mel_response_incomplete, false);
  assert.equal(calls[1].messages.at(-3).role, 'assistant');
  assert.match(calls[1].messages.at(-2).content, /Continue exactement/);
  assert.equal(calls[1].messages.at(-1).role, 'assistant');
});

test('chat AI wrapper bounds repeated truncation to configured continuation segments', async () => {
  let calls = 0;
  const env = {
    MEL_MAX_CONTINUATION_SEGMENTS: '2',
    AI: {
      async run() {
        calls++;
        return { response: `segment-${calls}`, finish_reason: 'max_tokens' };
      }
    }
  };
  const wrapped = withChatAiDefaults(env);
  const result = await wrapped.AI.run('model', { messages: [{ role: 'user', content: 'long' }] });
  assert.equal(calls, 2);
  assert.equal(result.mel_continuation_segments, 2);
  assert.equal(result.mel_response_incomplete, true);
  assert.match(result.response, /segment-1/);
  assert.match(result.response, /segment-2/);
});
