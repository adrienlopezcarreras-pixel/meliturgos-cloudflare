import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { authorizeDevBridge } from '../src/core/dev-bridge-auth.js';

function request(authorization) {
  const headers = new Headers();
  if (authorization !== undefined) headers.set('authorization', authorization);
  return new Request('https://mel.example/api/dev-bridge/heartbeat', { headers });
}

async function body(response) {
  return response ? response.json() : null;
}

test('dev bridge fails closed when its dedicated secret is absent', async () => {
  for (const env of [{}, { MEL_DEV_BRIDGE_TOKEN: '' }, { MEL_DEV_BRIDGE_TOKEN: '   ' }]) {
    const response = authorizeDevBridge(request('Bearer '), env);
    assert.ok(response instanceof Response);
    assert.equal(response.status, 503);
    assert.equal((await body(response)).code, 'BRIDGE_NOT_CONFIGURED');
    assert.match(response.headers.get('cache-control') || '', /no-store/);
  }
});

test('dev bridge rejects missing, malformed and incorrect bearer credentials', async () => {
  const env = { MEL_DEV_BRIDGE_TOKEN: 'correct-secret' };
  for (const authorization of [undefined, '', 'Basic correct-secret', 'Bearer wrong-secret', 'Bearer  correct-secret']) {
    const response = authorizeDevBridge(request(authorization), env);
    assert.ok(response instanceof Response);
    assert.equal(response.status, 401);
    assert.equal((await body(response)).code, 'BRIDGE_AUTH_REQUIRED');
  }
});

test('dev bridge accepts only the exact configured bearer token', () => {
  const response = authorizeDevBridge(request('Bearer correct-secret'), { MEL_DEV_BRIDGE_TOKEN: 'correct-secret' });
  assert.equal(response, null);
});

test('deployed entrypoint runs the bridge gate before delegating to the application', async () => {
  const source = await readFile(new URL('../src/professor-live-learning-entry.js', import.meta.url), 'utf8');
  const gate = source.indexOf("if (url.pathname.startsWith('/api/dev-bridge/'))");
  const auth = source.indexOf('authorizeDevBridge(request, env)', gate);
  const delegate = source.indexOf('await app.fetch(request, env, ctx)');
  assert.ok(gate >= 0, 'deployed entrypoint must recognize dev bridge routes');
  assert.ok(auth > gate, 'deployed entrypoint must invoke the dedicated bridge auth');
  assert.ok(delegate > auth, 'bridge auth must run before application delegation');
});
