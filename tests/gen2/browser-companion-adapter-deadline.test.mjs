import test from 'node:test';
import assert from 'node:assert/strict';

import { BROWSER_ACTIONS } from '../../src/devices/browser-capability.js';
import { createBrowserCompanionAdapter } from '../../src/devices/browser-companion-adapter.js';

const step = { id: 'nav', action: BROWSER_ACTIONS.NAVIGATE, url: 'https://example.com/start' };
const context = {
  sessionId: 'deadline-session',
  deviceId: 'windows-companion',
  allowedOrigins: ['https://example.com'],
};

test('GEN2-31 enforces total deadline when response stream stalls after headers', async () => {
  let canceled = false;
  let reads = 0;
  const stream = new ReadableStream({
    pull(controller) {
      reads += 1;
      if (reads === 1) controller.enqueue(new TextEncoder().encode('{"ok":'));
      // Never complete the second read: the adapter must time out and cancel.
    },
    cancel() { canceled = true; },
  }, { highWaterMark: 0 });
  const adapter = createBrowserCompanionAdapter({
    timeoutMs: 250,
    binding: { fetch: async () => new Response(stream, { status: 200 }) },
  });
  const started = Date.now();
  await assert.rejects(adapter.perform(step, context),
    error => error.code === 'BROWSER_COMPANION_TIMEOUT' && error.status === 504);
  assert.equal(canceled, true);
  assert.ok(Date.now() - started < 2000, 'stream timeout must not wait indefinitely');
});

test('GEN2-31 enforces deadline when binding ignores request abort', async () => {
  let called = false;
  const adapter = createBrowserCompanionAdapter({
    timeoutMs: 250,
    binding: {
      fetch: () => {
        called = true;
        return new Promise(() => {});
      },
    },
  });
  await assert.rejects(adapter.perform(step, context),
    error => error.code === 'BROWSER_COMPANION_TIMEOUT' && error.status === 504);
  assert.equal(called, true);
});

test('GEN2-31 does not convert an oversized stream error into an unreachable error', async () => {
  const adapter = createBrowserCompanionAdapter({
    timeoutMs: 1000,
    binding: {
      fetch: async () => new Response(new Uint8Array(131073), { status: 200 }),
    },
  });
  await assert.rejects(adapter.perform(step, context),
    error => error.code === 'BROWSER_COMPANION_RESPONSE_TOO_LARGE');
});
