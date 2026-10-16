import test from 'node:test';
import assert from 'node:assert/strict';

import { BROWSER_ACTIONS } from '../../src/devices/browser-capability.js';
import { createBrowserCompanionAdapter } from '../../src/devices/browser-companion-adapter.js';

const step = { id: 'nav', action: BROWSER_ACTIONS.NAVIGATE, url: 'https://example.com/ok' };
const context = { sessionId: 'session-1', deviceId: 'device-1', allowedOrigins: ['https://example.com'] };

function trackedBinding() {
  const calls = [];
  return {
    calls,
    fetch: async request => {
      calls.push(request);
      return new Response(JSON.stringify({
        schema: 'mel.devices.browser-companion.v1',
        ok: true,
        step_id: step.id,
        action: step.action,
        result: { kind: 'navigation' },
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    },
  };
}

test('GEN2-31 rejects credential-bearing browser action URLs before service binding fetch', async () => {
  const binding = trackedBinding();
  const adapter = createBrowserCompanionAdapter({ binding });
  for (const url of [
    'https://name:password@example.com/private',
    'https://name@example.com/private',
    'https://:password@example.com/private',
  ]) {
    await assert.rejects(
      adapter.perform({ ...step, url }, context),
      error => error.code === 'ORIGIN_OUTSIDE_SANDBOX',
    );
  }
  assert.deepEqual(binding.calls, []);
});

test('GEN2-31 ignores credential-bearing allowed origins before executing browser step', async () => {
  const binding = trackedBinding();
  const adapter = createBrowserCompanionAdapter({ binding });
  await assert.rejects(
    adapter.perform(step, { ...context, allowedOrigins: ['https://name:password@example.com/path'] }),
    error => error.code === 'BROWSER_ALLOWED_ORIGINS_REQUIRED',
  );
  assert.deepEqual(binding.calls, []);
});

test('GEN2-31 rejects credential-bearing browser companion endpoint instead of stripping secrets', () => {
  const binding = trackedBinding();
  assert.throws(
    () => createBrowserCompanionAdapter({ binding, endpoint: 'https://name:password@browser-companion.internal' }),
    error => error.code === 'BROWSER_COMPANION_ENDPOINT_INVALID',
  );
  assert.deepEqual(binding.calls, []);
});

test('GEN2-31 preserves credential-free HTTPS origin transport', async () => {
  const binding = trackedBinding();
  const adapter = createBrowserCompanionAdapter({ binding });
  const result = await adapter.perform(step, {
    ...context,
    allowedOrigins: ['https://example.com/subpath'],
  });
  assert.deepEqual(result, { kind: 'navigation' });
  assert.equal(binding.calls.length, 1);
});
