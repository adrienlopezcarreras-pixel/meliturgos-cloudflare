import test from 'node:test';
import assert from 'node:assert/strict';
import { isFastChatEligible, maybeHandleFastChat, FAST_CHAT_MODEL } from '../src/api/fast-chat.js';

const auth = 'Basic ' + Buffer.from('test:test-only').toString('base64');

function request(text, authorized = true) {
  return new Request('http://localhost/api/chat', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(authorized ? { authorization: auth } : {}),
    },
    body: JSON.stringify({ text, conversation_id: 'fast-test', device_id: 'ubuntu' }),
  });
}

test('fast lane accepts ordinary short conversation', () => {
  assert.equal(isFastChatEligible('Bonjour Mel, comment vas-tu ?'), true);
  assert.equal(isFastChatEligible('Merci, parfait.'), true);
});

test('fast lane leaves development, tools, memory and deep analysis to full pipeline', () => {
  assert.equal(isFastChatEligible('Continue ta feuille de route et développe ton code'), false);
  assert.equal(isFastChatEligible('Cherche sur internet les dernières nouvelles'), false);
  assert.equal(isFastChatEligible('Souviens-toi de notre ancienne conversation'), false);
  assert.equal(isFastChatEligible('Analyse complètement ce document PDF'), false);
});

test('fast lane invokes Flash and returns latency metadata', async () => {
  const calls = [];
  const env = {
    MELITURGOS_USER: 'test',
    MELITURGOS_PASSWORD: 'test-only',
    AI: {
      async run(model, input) {
        calls.push({ model, input });
        return { response: 'Bonjour ! Je suis là.' };
      },
    },
  };
  const response = await maybeHandleFastChat(request('Bonjour Mel'), env);
  const data = await response.json();
  assert.equal(response.status, 200, JSON.stringify(data));
  assert.equal(data.fast_lane, true);
  assert.equal(data.model, FAST_CHAT_MODEL);
  assert.equal(data.text, 'Bonjour ! Je suis là.');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].model, FAST_CHAT_MODEL);
  assert.ok(Number.isFinite(data.latency_ms));
});

test('fast lane falls through when Flash fails', async () => {
  const env = {
    MELITURGOS_USER: 'test',
    MELITURGOS_PASSWORD: 'test-only',
    AI: { async run() { throw new Error('MODEL_UNAVAILABLE'); } },
  };
  const result = await maybeHandleFastChat(request('Bonjour Mel'), env);
  assert.equal(result, null);
});

test('fast lane requires MEL authentication before model invocation', async () => {
  let calls = 0;
  const env = {
    MELITURGOS_USER: 'test',
    MELITURGOS_PASSWORD: 'test-only',
    AI: { async run() { calls++; return { response: 'no' }; } },
  };
  const response = await maybeHandleFastChat(request('Bonjour Mel', false), env);
  assert.equal(response.status, 401);
  assert.equal(calls, 0);
});
