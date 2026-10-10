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


test('MINI reset policy rejects scheduled and dispatch-triggered serial resets', async () => {
  const runner = await readFile(new URL('../../scripts/cloudflare-api-relay-runner.mjs', import.meta.url), 'utf8');
  const workflow = await readFile(new URL('../../.github/workflows/cloudflare-api-relay.yml', import.meta.url), 'utf8');
  const api = await readFile(new URL('../../src/devices/computer-companion-api.js', import.meta.url), 'utf8');
  assert.ok(!workflow.includes('MEL_MINI_RESET_APPROVED'));
  assert.ok(!runner.includes('MEL_MINI_RESET_APPROVED'));
  assert.ok(!runner.includes("action:'serial.hard_reset'"));
  assert.ok(runner.includes('automatic_reset_allowed:false'));
  const oidcAllowed = api.split('const PC_CONTROL_PROOF_ACTIONS=new Set(')[1]?.split(';')[0] || '';
  assert.ok(!oidcAllowed.includes('"serial.hard_reset"'));
  assert.ok(oidcAllowed.includes('"serial.read"'));
});

test('Cloudflare relay exposes only sanitized published MINI firmware metadata', async () => {
  const api = await readFile(new URL('../../src/api/cloudflare-api-relay.js', import.meta.url), 'utf8');
  const runner = await readFile(new URL('../../scripts/cloudflare-api-relay-runner.mjs', import.meta.url), 'utf8');
  assert.match(api, /cloudflare-api-relay\/mini-firmware-status/);
  assert.match(api, /devices\/waveshare-esp32-s3-touch-lcd-3\.5-c\/manifest\.json/);
  assert.match(api, /source_sha/);
  assert.match(api, /MINI_FIRMWARE_MANIFEST_INVALID/);
  assert.doesNotMatch(api, /mini-firmware-status[\s\S]{0,2500}object\.body/);
  assert.match(runner, /MINI_PUBLISHED_FIRMWARE_STATUS=/);
});
