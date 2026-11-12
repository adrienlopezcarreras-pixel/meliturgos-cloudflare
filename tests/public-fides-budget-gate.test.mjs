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

test('invalid JSON never consumes a global daily AI quota slot', async () => {
  const inserted = [];
  const db = {
    prepare(sql) {
      let values = [];
      return {
        bind(...args) { values = args; return this; },
        async run() {
          if (sql.startsWith('INSERT INTO public_rate_limits')) inserted.push(values[0]);
          return {};
        },
        async first() { return { window_started: Date.now(), count: 1 }; },
      };
    },
  };
  let aiCalls = 0;
  const env = {
    FIDES_PUBLIC_CHAT_ENABLED: 'true',
    AI: { run: async () => { aiCalls++; return { response: 'unexpected' }; } },
    DB: db,
  };
  const invalid = new Request('https://mel.example/api/public/fides/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'cf-connecting-ip': '192.0.2.99' },
    body: '{invalid-json',
  });
  const response = await handlePublicFidesChat(invalid, env);
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error, 'FIDES_BODY_INVALID');
  assert.equal(aiCalls, 0);
  assert.equal(inserted.length, 1, 'only the per-IP limiter must be updated');
  assert.ok(inserted[0].startsWith('fides-guest-chat:'), 'global daily cap must not be consumed');
});

test('public AI failures never leak provider internals', async () => {
  const db = {
    prepare(sql) {
      return {
        bind() { return this; },
        async run() { return {}; },
        async first() { return { window_started: Date.now(), count: 1 }; },
      };
    },
  };
  const env = {
    FIDES_PUBLIC_CHAT_ENABLED: 'true',
    DB: db,
    AI: { run: async () => { throw new Error('PRIVATE_PROVIDER_KEY_DO_NOT_DISCLOSE'); } },
  };
  const response = await handlePublicFidesChat(request('Que dit le Catéchisme sur la charité ?'), env);
  assert.equal(response.status, 502);
  const payload = await response.json();
  assert.equal(payload.error, 'FIDES_CHAT_FAILED');
  assert.ok(!JSON.stringify(payload).includes('PRIVATE_PROVIDER_KEY_DO_NOT_DISCLOSE'));
});
