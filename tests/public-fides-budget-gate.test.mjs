import test from 'node:test';
import assert from 'node:assert/strict';
import { handlePublicFidesChat } from '../src/api/public-fides-chat.js';

function request(message = 'Que dit le Catéchisme ?') {
  return new Request('https://mel.example/api/public/fides/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'cf-connecting-ip': '192.0.2.80' },
    body: JSON.stringify({ message }),
  });
}

test('FIDES stays closed by default, even when Workers AI is bound', async () => {
  let calls = 0;
  const env = { AI: { run: async () => { calls++; return { response: 'unexpected' }; } } };
  const response = await handlePublicFidesChat(request(), env);
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error, 'FIDES_PUBLIC_CHAT_PAUSED');
  assert.equal(calls, 0);
});

test('FIDES fails closed when durable rate-limit DB is absent', async () => {
  let calls = 0;
  const env = {
    FIDES_PUBLIC_CHAT_ENABLED: 'true',
    AI: { run: async () => { calls++; return { response: 'unexpected' }; } },
  };
  const response = await handlePublicFidesChat(request(), env);
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error, 'PUBLIC_RATE_LIMIT_UNAVAILABLE');
  assert.equal(calls, 0);
});

test('FIDES fails closed if durable rate-limit DB throws', async () => {
  let calls = 0;
  const env = {
    FIDES_PUBLIC_CHAT_ENABLED: 'true',
    AI: { run: async () => { calls++; return { response: 'unexpected' }; } },
    DB: { prepare: () => { throw new Error('DB unavailable'); } },
  };
  const response = await handlePublicFidesChat(request(), env);
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error, 'PUBLIC_RATE_LIMIT_UNAVAILABLE');
  assert.equal(calls, 0);
});
