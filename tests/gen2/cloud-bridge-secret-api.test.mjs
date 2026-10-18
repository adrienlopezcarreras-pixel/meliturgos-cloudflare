import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

test('cloud bridge token is installed and removed through the Cloudflare API script', async () => {
  const source = await readFile(new URL('../../.github/workflows/gen2-42-apply-ready-bridge.yml', import.meta.url), 'utf8');
  assert.match(source, /node scripts\/cf-worker-secret\.mjs put MEL_CLOUD_BRIDGE_TOKEN/);
  assert.match(source, /node scripts\/cf-worker-secret\.mjs delete MEL_CLOUD_BRIDGE_TOKEN/);
  assert.doesNotMatch(source, /wrangler secret (put|delete) MEL_CLOUD_BRIDGE_TOKEN/);
});

test('secret script refuses bad usage and missing credentials without printing values', () => {
  const script = new URL('../../scripts/cf-worker-secret.mjs', import.meta.url).pathname;
  const bad = spawnSync(process.execPath, [script, 'put', 'lower'], { input: 'v', env: {} });
  assert.equal(bad.status, 2);
  const noCreds = spawnSync(process.execPath, [script, 'put', 'MEL_X'], { input: 'secret-value', env: {} });
  assert.equal(noCreds.status, 2);
  assert.doesNotMatch(String(noCreds.stdout) + String(noCreds.stderr), /secret-value/);
});
