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

test('dev bridge accepts only the exact configured local bearer token', () => {
  const response = authorizeDevBridge(request('Bearer correct-secret'), { MEL_DEV_BRIDGE_TOKEN: 'correct-secret' });
  assert.equal(response, null);
});

test('dev bridge accepts a separate ephemeral cloud bearer token without changing the local token', async () => {
  const env = {
    MEL_DEV_BRIDGE_TOKEN: 'local-secret',
    MEL_CLOUD_BRIDGE_TOKEN: 'cloud-secret',
  };
  assert.equal(authorizeDevBridge(request('Bearer cloud-secret'), env), null);
  assert.equal(authorizeDevBridge(request('Bearer local-secret'), env), null);
  const denied = authorizeDevBridge(request('Bearer other-secret'), env);
  assert.equal(denied.status, 401);
  assert.equal((await body(denied)).code, 'BRIDGE_AUTH_REQUIRED');
});

test('deployed entrypoint gates every internal Dev Bridge route before delegation', async () => {
  const source = await readFile(new URL('../src/professor-live-learning-entry.js', import.meta.url), 'utf8');
  const gate = source.indexOf("url.pathname.startsWith('/api/dev-bridge/')");
  const auth = source.indexOf('authorizeDevBridge(request, env)', gate);
  const delegate = source.indexOf('return app.fetch(request, env, ctx)');

  assert.equal(source.includes('PROFESSOR_SAFE_DEV_BRIDGE_PATHS'), false, 'internal bridge must have no owner-UI auth bypass list');
  assert.equal(source.includes("'/api/dev-bridge/health'"), false, 'user Work health moved to /api/work/health');
  assert.equal(source.includes("'/api/dev-bridge/jobs'"), false, 'user Work jobs moved to /api/work/jobs');
  assert.ok(gate >= 0, 'deployed entrypoint must recognize all dev bridge routes');
  assert.ok(auth > gate, 'every dev bridge route must invoke the dedicated bridge auth');
  assert.ok(delegate > auth, 'bridge auth must run before application delegation');
});

test('cloud bridge OIDC claim/result pass every synchronous gate of the deployed entry', async () => {
  const { isOidcBridgeCall } = await import('../src/core/dev-bridge-auth.js');
  const oidc = (path, extra = {}) => new Request('https://mel.example' + path, { method: 'POST', headers: { 'x-mel-github-oidc': 'tok', ...extra } });
  assert.equal(isOidcBridgeCall(oidc('/api/dev-bridge/claim')), true);
  assert.equal(isOidcBridgeCall(oidc('/api/dev-bridge/result')), true);
  assert.equal(isOidcBridgeCall(oidc('/api/dev-bridge/heartbeat')), false);
  assert.equal(isOidcBridgeCall(oidc('/api/dev-bridge/claim', { authorization: 'Bearer x' })), false);

  // Real entry, no bridge secret installed: a malformed OIDC token must reach
  // the OIDC verifier (401), never stop at BRIDGE_NOT_CONFIGURED (503).
  const entry = (await import('../src/professor-live-learning-entry.js')).default;
  const response = await entry.fetch(new Request('https://mel.example/api/dev-bridge/claim', {
    method: 'POST', headers: { 'x-mel-github-oidc': 'a.b.c', 'content-type': 'application/json' }, body: '{"job_id":"x"}',
  }), { MEL_GITHUB_REPOSITORY: 'o/r', DB: { prepare() { throw new Error('no db'); } } }, { waitUntil() {} });
  const payload = await response.json().catch(() => ({}));
  assert.notEqual(payload.code, 'BRIDGE_NOT_CONFIGURED');
  assert.match(String(payload.code || ''), /^GITHUB_OIDC_/);
});
