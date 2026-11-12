import test from 'node:test';
import assert from 'node:assert/strict';
import { enforcePublicRateLimit } from '../src/security/public-rate-limit.js';

function fakeDb() {
  const rows = new Map();
  return {
    prepare(sql) {
      let params = [];
      return {
        bind(...values) { params = values; return this; },
        async run() {
          if (sql.startsWith('CREATE TABLE')) return {};
          if (!sql.startsWith('INSERT INTO public_rate_limits')) throw new Error('unexpected SQL');
          const [key, now, , resetBefore] = params;
          const old = rows.get(key);
          rows.set(key, !old || old.window_started <= resetBefore
            ? { window_started: now, count: 1 }
            : { window_started: old.window_started, count: old.count + 1 });
          return {};
        },
        async first() {
          if (!sql.startsWith('SELECT window_started,count')) throw new Error('unexpected SQL');
          return rows.get(params[0]) || null;
        },
      };
    },
    rows,
  };
}

function req(ip) {
  return new Request('https://example.test/api/public/fides/chat', {
    headers: { 'cf-connecting-ip': ip, 'user-agent': 'fides-test' },
  });
}

test('shared daily quota is global, even across different client IPs', async () => {
  const env = { DB: fakeDb() };
  const options = {
    scope: 'fides-guest-chat-global-day-test',
    limit: 30,
    windowMs: 24 * 60 * 60_000,
    sharedIdentity: true,
    failClosed: true,
  };
  for (let i = 0; i < 30; i++) {
    const response = await enforcePublicRateLimit(req('192.0.2.' + (i + 1)), env, options);
    assert.equal(response.ok, true, 'call ' + (i + 1));
  }
  const blocked = await enforcePublicRateLimit(req('198.51.100.42'), env, options);
  assert.equal(blocked.ok, false);
  assert.equal(blocked.status, 429);
  assert.equal(blocked.count, 31);
  assert.ok(blocked.retry_after_seconds > 3600, 'rolling daily window must not be clamped to one hour');
  assert.equal(env.DB.rows.size, 1, 'all IPs must share the same persistent quota');
});

test('shared daily limit fails closed when durable database is unavailable', async () => {
  const result = await enforcePublicRateLimit(req('192.0.2.9'), {}, {
    scope: 'fides-global-db-missing-test',
    limit: 30,
    windowMs: 86400000,
    sharedIdentity: true,
    failClosed: true,
  });
  assert.equal(result.status, 503);
  assert.equal(result.ok, false);
});
