import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('production main Worker binds the real Browser Companion service', async () => {
  const wrangler = await readFile(new URL('../wrangler.jsonc', import.meta.url), 'utf8');
  assert.match(wrangler, /"binding": "MEL_BROWSER_COMPANION"/);
  assert.match(wrangler, /"service": "mel-browser-companion"/);
  assert.match(wrangler, /"CAPABILITY_PERMISSIONS": "browser\.control"/);
});

test('production Browser Companion keeps Browser Rendering and durable sessions enabled', async () => {
  const config = await readFile(new URL('../browser-companion/runtime/wrangler.browser-production.jsonc', import.meta.url), 'utf8');
  assert.match(config, /"name": "mel-browser-companion"/);
  assert.match(config, /"binding": "BROWSER"/);
  assert.match(config, /"name": "BROWSER_SESSIONS"/);
  assert.match(config, /"class_name": "BrowserSession"/);
  assert.match(config, /"new_sqlite_classes"/);
});

test('canonical release deploys and proves browser.execute through production', async () => {
  const workflow = await readFile(new URL('../.github/workflows/deploy-cloudflare-release.yml', import.meta.url), 'utf8');
  const router = await readFile(new URL('../src/router.js', import.meta.url), 'utf8');
  assert.match(workflow, /Deploy production Browser Companion/);
  assert.match(workflow, /wrangler deploy --config browser-companion\/runtime\/wrangler\.browser-production\.jsonc/);
  assert.match(workflow, /Prove real production browser\.execute/);
  assert.match(workflow, /"id":"browser\.execute"/);
  assert.match(workflow, /Example Domain/);
  assert.match(router, /"browser\.execute"/);
});
