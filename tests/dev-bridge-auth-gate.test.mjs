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

test('deployed entrypoint keeps the bridge gate before delegation while exempting only safe Professor preflight routes', async () => {
  const source = await readFile(new URL('../src/professor-live-learning-entry.js', import.meta.url), 'utf8');
  const safeSet = source.indexOf('PROFESSOR_SAFE_DEV_BRIDGE_PATHS');
  const gate = source.indexOf("url.pathname.startsWith('/api/dev-bridge/')");
  const safeExemption = source.indexOf('!PROFESSOR_SAFE_DEV_BRIDGE_PATHS.has(url.pathname)', gate);
  const auth = source.indexOf('authorizeDevBridge(request, env)', gate);
  const delegate = source.indexOf('await app.fetch(request, env, ctx)');

  assert.ok(safeSet >= 0, 'deployed entrypoint must define the narrow safe Professor dev-bridge allowlist');
  assert.ok(source.includes("'/api/dev-bridge/health'"), 'safe allowlist must include only the read-only health surface');
  assert.ok(source.includes("'/api/dev-bridge/jobs'"), 'safe allowlist must include the owner-authenticated preflight jobs surface');
  assert.ok(gate >= 0, 'deployed entrypoint must recognize all dev bridge routes');
  assert.ok(safeExemption > gate, 'only the explicit safe Professor routes may bypass dedicated bridge auth');
  assert.ok(auth > safeExemption, 'all remaining dev bridge routes must invoke the dedicated bridge auth');
  assert.ok(delegate > auth, 'bridge auth must run before application delegation');
});
