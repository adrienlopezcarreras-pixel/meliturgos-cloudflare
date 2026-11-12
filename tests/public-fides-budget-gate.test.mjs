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

test('enabled FIDES sends only scoped system and visitor messages, with bounded output', async () => {
  const rows = new Map();
  const db = {
    prepare(sql) {
      let values = [];
      return {
        bind(...args) { values = args; return this; },
        async run() {
          if (sql.startsWith('CREATE TABLE')) return {};
          if (sql.startsWith('INSERT INTO public_rate_limits')) {
            const [key, now, , before] = values;
            const prev = rows.get(key);
            rows.set(key, !prev || prev.window_started <= before
              ? { window_started: now, count: 1 }
              : { window_started: prev.window_started, count: prev.count + 1 });
          }
          return {};
        },
        async first() { return rows.get(values[0]) || null; },
      };
    },
  };
  const invocations = [];
  const env = {
    FIDES_PUBLIC_CHAT_ENABLED: 'true',
    DB: db,
    AI: { run: async (model, input) => {
      invocations.push({ model, input });
      return { response: 'La foi catholique enseigne la charité.' };
    } },
  };
  const response = await handlePublicFidesChat(
    request('Que dit le Catéchisme sur la charité ?'), env
  );
  const json = await response.json();
  assert.equal(response.status, 200);
  assert.equal(json.ok, true);
  assert.equal(json.private_data_access, false);
  assert.equal(json.action_access, false);
  assert.equal(invocations.length, 1);
  assert.deepEqual(invocations[0].input.messages.map(m => m.role), ['system', 'user']);
  assert.equal(invocations[0].input.messages[1].content, 'Que dit le Catéchisme sur la charité ?');
  assert.match(invocations[0].input.messages[0].content, /Bible de Jerusalem/);
  assert.match(invocations[0].input.messages[0].content, /Vatican/);
  assert.equal(invocations[0].input.max_tokens, 1800);
  assert.equal(rows.size, 2, 'per-IP and global D1 quota counters must both be persisted');
});
