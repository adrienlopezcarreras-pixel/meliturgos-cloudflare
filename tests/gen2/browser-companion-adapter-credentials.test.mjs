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


test('GEN2-31 cancels an oversized streamed response before buffering its full body', async () => {
  let pulls = 0;
  let canceled = false;
  const body = new ReadableStream({
    pull(controller) {
      pulls += 1;
      controller.enqueue(new Uint8Array(65536));
      if (pulls >= 10) controller.close();
    },
    cancel() { canceled = true; },
  }, { highWaterMark: 0 });
  const adapter = createBrowserCompanionAdapter({
    binding: { fetch: async () => new Response(body, { status: 200 }) },
  });
  await assert.rejects(
    adapter.perform(step, context),
    error => error.code === 'BROWSER_COMPANION_RESPONSE_TOO_LARGE',
  );
  assert.equal(canceled, true);
  assert.ok(pulls <= 3, 'the oversized response must not be fully consumed');
});

test('GEN2-31 rejects a declared oversized response without reading its stream', async () => {
  let reads = 0;
  let canceled = false;
  const body = new ReadableStream({
    pull(controller) { reads += 1; controller.enqueue(new Uint8Array(1)); },
    cancel() { canceled = true; },
  }, { highWaterMark: 0 });
  const adapter = createBrowserCompanionAdapter({
    binding: {
      fetch: async () => new Response(body, {
        status: 200,
        headers: { 'content-length': '131073' },
      }),
    },
  });
  await assert.rejects(
    adapter.perform(step, context),
    error => error.code === 'BROWSER_COMPANION_RESPONSE_TOO_LARGE',
  );
  assert.equal(reads, 0);
  assert.equal(canceled, true);
});

test('GEN2-31 accepts a valid JSON response exactly at the byte ceiling', async () => {
  const responseText = JSON.stringify({
    schema: 'mel.devices.browser-companion.v1',
    ok: true,
    step_id: step.id,
    action: step.action,
    result: { kind: 'navigation' },
  }).padEnd(131072, ' ');
  const bytes = new TextEncoder().encode(responseText);
  assert.equal(bytes.byteLength, 131072);
  const adapter = createBrowserCompanionAdapter({
    binding: {
      fetch: async () => new Response(new ReadableStream({
        start(controller) {
          controller.enqueue(bytes.slice(0, 70000));
          controller.enqueue(bytes.slice(70000));
          controller.close();
        },
      })),
    },
  });
  assert.deepEqual(await adapter.perform(step, context), { kind: 'navigation' });
});
