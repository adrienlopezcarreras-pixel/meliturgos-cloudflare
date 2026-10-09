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


test('Cloudflare relay deployment create is bounded, non-force and verifies the created deployment', async () => {
  const source = await readFile(new URL('../../scripts/cloudflare-api-relay-runner.mjs', import.meta.url), 'utf8');
  const createBranch = source.slice(source.indexOf("job.operation==='deployments.create'"));
  assert.match(createBranch, /method:'POST'/);
  assert.match(createBranch, /strategy:'percentage'/);
  assert.match(createBranch, /workers\/message/);
  assert.match(createBranch, /await cf\(path\+'\/'\+encodeURIComponent\(deploymentId\)\)/);
  assert.doesNotMatch(createBranch, /force\s*:/);
});


test('Cloudflare relay exposes only sanitized MINI heartbeat fields to its scoped OIDC workflow', async () => {
  const api = await readFile(new URL('../../src/api/cloudflare-api-relay.js', import.meta.url), 'utf8');
  const runner = await readFile(new URL('../../scripts/cloudflare-api-relay-runner.mjs', import.meta.url), 'utf8');
  assert.match(api, /cloudflare-api-relay\/mini-status/);
  assert.match(api, /firmware:status\.firmware/);
  assert.match(api, /microphone:status\.microphone/);
  assert.match(api, /speaker:status\.speaker/);
  assert.match(api, /camera:status\.camera/);
  assert.match(api, /internal_storage:status\.internal_storage/);
  const miniBranch = api.slice(api.indexOf("cloudflare-api-relay/mini-status"), api.indexOf("cloudflare-api-relay/claim"));
  assert.doesNotMatch(miniBranch, /status\.ip/);
  assert.match(runner, /MINI_DEVICE_STATUS=/);
  assert.match(runner, /cloudflare-api-relay\/mini-status/);
});


test('MINI reset is manual-only, model-guarded and followed by heartbeat proof', async () => {
  const runner = await readFile(new URL('../../scripts/cloudflare-api-relay-runner.mjs', import.meta.url), 'utf8');
  const workflow = await readFile(new URL('../../.github/workflows/cloudflare-api-relay.yml', import.meta.url), 'utf8');
  assert.match(workflow, /MEL_MINI_RESET_APPROVED:/);
  assert.match(workflow, /github\.event_name == 'workflow_dispatch'/);
  assert.match(runner, /MEL_MINI_RESET_APPROVED/);
  assert.match(runner, /waveshare-esp32-s3/);
  assert.match(runner, /primaryMini\?\.online===false/);
  assert.match(runner, /action:'serial\.hard_reset'/);
  assert.match(runner, /MINI_SERIAL_HARD_RESET_PROOF=/);
  assert.match(runner, /MINI_DEVICE_STATUS_AFTER_RESET=/);
  assert.match(runner, /MINI_USB_INSPECT=/);
  assert.match(runner, /engineReadyForReset/);
  assert.match(runner, /COMPANION_ENGINE_REFRESH_REQUIRED/);
  assert.match(runner, /engine_refresh_status/);
});
