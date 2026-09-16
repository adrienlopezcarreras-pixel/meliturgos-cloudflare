import test from 'node:test';
import assert from 'node:assert/strict';
import { CapabilityBus } from '../src/capabilities/capability-bus.js';
import { registerBrowserRuntimeCapabilities } from '../src/capabilities/browser-runtime-capabilities.js';
import { createBrowserCompanionAdapter } from '../src/devices/browser-companion-adapter.js';
import { BROWSER_ACTIONS } from '../src/devices/browser-capability.js';

function request() {
  return {
    session_id: 'session-31',
    device: { id: 'browser-1', capabilities: ['browser.control'] },
    sandbox: { allowed_origins: ['https://example.com'], max_steps: 5 },
    approvals: [],
    steps: [{ id: 'nav', action: BROWSER_ACTIONS.NAVIGATE, url: 'https://example.com/start' }],
  };
}

function fakeBinding() {
  const calls = [];
  return {
    calls,
    async fetch(req) {
      const url = new URL(req.url);
      if (url.pathname === '/health') {
        calls.push({ method: req.method, path: url.pathname, payload: null });
        return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
      }
      const payload = await req.json();
      calls.push({ method: req.method, path: url.pathname, payload });
      return new Response(JSON.stringify({ ok: true, result: { action: payload.step.action } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    },
  };
}

test('browser companion is fail-closed and does not leak caller metadata', async () => {
  const binding = fakeBinding();
  const adapter = createBrowserCompanionAdapter({ binding, timeoutMs: 1000 });
  assert.equal(await adapter.health(), 'ONLINE');

  const result = await adapter.perform(request().steps[0], {
    sessionId: 'session-31',
    deviceId: 'browser-1',
    allowedOrigins: ['https://example.com'],
    owner: 'private-owner',
    permissions: ['browser.control'],
    requestId: 'private-request',
  });
  assert.deepEqual(result, { action: BROWSER_ACTIONS.NAVIGATE });

  const payload = binding.calls.at(-1).payload;
  assert.equal(payload.session_id, 'session-31');
  assert.equal(payload.device_id, 'browser-1');
  assert.deepEqual(payload.sandbox.allowed_origins, ['https://example.com']);
  assert.equal('owner' in payload, false);
  assert.equal('permissions' in payload, false);
  assert.equal('requestId' in payload, false);

  await assert.rejects(() => adapter.perform(
    { id: 'outside', action: BROWSER_ACTIONS.NAVIGATE, url: 'https://outside.example/' },
    { sessionId: 'session-31', deviceId: 'browser-1', allowedOrigins: ['https://example.com'] },
  ), { code: 'ORIGIN_OUTSIDE_SANDBOX' });
});

test('browser.execute requires bus permission and exact controller gates', async () => {
  const binding = fakeBinding();
  const audits = [];
  const bus = new CapabilityBus({ audit: async event => audits.push(event) });
  registerBrowserRuntimeCapabilities(bus, { binding });

  assert.equal(bus.describe('browser.execute').health, 'HEALTHY');
  const before = binding.calls.length;
  await assert.rejects(() => bus.execute('browser.execute', request(), {
    owner: 'owner',
    permissions: [],
    requestId: 'r-denied',
  }), { code: 'PERMISSION_DENIED' });
  assert.equal(binding.calls.length, before + 1); // healthcheck only; no perform POST

  const result = await bus.execute('browser.execute', request(), {
    owner: 'owner',
    permissions: ['browser.control'],
    requestId: 'r-ok',
  });
  assert.equal(result.ok, true);
  assert.equal(result.steps_completed, 1);
  assert.equal(audits.some(row => row.kind === 'BROWSER_CAPABILITY_AUDIT' && row.status === 'COMPLETED'), true);
});

test('browser.execute is discoverable but unavailable without a configured companion', async () => {
  const bus = new CapabilityBus();
  registerBrowserRuntimeCapabilities(bus);
  assert.equal(bus.describe('browser.execute').health, 'UNAVAILABLE');
  await assert.rejects(() => bus.execute('browser.execute', request(), {
    owner: 'owner',
    permissions: ['browser.control'],
    requestId: 'r-unavailable',
  }), { code: 'CAPABILITY_UNAVAILABLE' });
});
