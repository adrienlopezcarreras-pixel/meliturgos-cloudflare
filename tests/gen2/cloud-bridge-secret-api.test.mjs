import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { devRuntime } from '../../src/dev/runtime-api.js';
import { enforceHttpAuthPolicy } from '../../src/security/http-auth-policy.js';

test('cloud bridge uses GitHub OIDC instead of installing a Worker secret', async () => {
  const source = await readFile(new URL('../../.github/workflows/gen2-42-apply-ready-bridge.yml', import.meta.url), 'utf8');
  assert.match(source, /id-token: write/);
  assert.match(source, /audience=meliturgos-worker/);
  assert.equal(source.split('x-mel-github-oidc: $("$MEL_OIDC_HELPER")').length - 1, 4);
  assert.doesNotMatch(source, /MEL_CLOUD_BRIDGE_TOKEN|cf-worker-secret|secret (put|delete)/);
});

test('OIDC is only accepted on claim/result and is verified before any work', async () => {
  const req = (path, headers) => new Request('https://mel.test' + path, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: '{}' });
  const env = { MEL_GITHUB_REPOSITORY: 'o/r', DB: {} };
  // Gate lets an OIDC claim through to the route, but not other bridge paths.
  assert.equal(enforceHttpAuthPolicy(req('/api/dev-bridge/claim', { 'x-mel-github-oidc': 'a.b.c' }), env), null);
  const other = enforceHttpAuthPolicy(req('/api/dev-bridge/commit', { 'x-mel-github-oidc': 'a.b.c' }), env);
  assert.ok(other && other.status >= 400);
  // The route itself rejects an invalid token.
  const response = await devRuntime(req('/api/dev-bridge/claim', { 'x-mel-github-oidc': 'not-a-jwt' }), env);
  assert.equal(response.status, 401);
  assert.match((await response.json()).code, /GITHUB_OIDC/);
});
