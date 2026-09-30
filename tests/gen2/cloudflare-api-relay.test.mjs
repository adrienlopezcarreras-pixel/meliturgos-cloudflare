import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { classifyHttpAuthSurface } from '../../src/security/http-auth-policy.js';
import { cloudflareApiRelay } from '../../src/api/cloudflare-api-relay.js';

test('Cloudflare API relay route delegates authentication to scoped OIDC handler', () => {
  const request = new Request('https://mel.example/api/internal/cloudflare-api-relay/heartbeat', { method:'POST' });
  assert.equal(classifyHttpAuthSurface(request).kind, 'DELEGATED_STRONG_AUTH');
});

test('Cloudflare API relay fails closed without GitHub Actions OIDC', async () => {
  const request = new Request('https://mel.example/api/internal/cloudflare-api-relay/heartbeat', {
    method:'POST',
    headers:{'content-type':'application/json'},
    body:'{}',
  });
  const response = await cloudflareApiRelay(request, { MEL_GITHUB_REPOSITORY:'owner/repo' });
  assert.equal(response.status, 401);
  const body = await response.json();
  assert.equal(body.ok, false);
  assert.equal(body.code, 'GITHUB_OIDC_TOKEN_REQUIRED');
});

test('Cloudflare API relay ignores unrelated routes', async () => {
  const response = await cloudflareApiRelay(
    new Request('https://mel.example/api/internal/other'),
    {},
  );
  assert.equal(response, null);
});


test('Cloudflare relay runner reads deployment list from documented result.deployments shape', async () => {
  const source = await readFile(new URL('../../scripts/cloudflare-api-relay-runner.mjs', import.meta.url), 'utf8');
  const deploymentBranch = source.slice(source.indexOf("job.operation==='deployments.list'"));
  assert.match(deploymentBranch, /Array\.isArray\(body\?\.result\?\.deployments\)\?body\.result\.deployments/);
  assert.doesNotMatch(deploymentBranch, /Array\.isArray\(body\?\.result\)\?body\.result:\[\]/);
});
