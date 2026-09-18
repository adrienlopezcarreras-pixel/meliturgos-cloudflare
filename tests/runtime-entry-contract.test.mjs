import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

async function source(path) {
  return readFile(path, 'utf8');
}

test('deployed scheduler keeps minute work separate from hourly maintenance', async () => {
  const [wrangler, index, professor] = await Promise.all([
    source('wrangler.jsonc'),
    source('src/index.js'),
    source('src/professor-live-learning-entry.js'),
  ]);

  assert.match(wrangler, /"\* \* \* \* \*"/);
  assert.match(wrangler, /"17 \* \* \* \*"/);
  assert.match(index, /cron === '17 \* \* \* \*'/);
  assert.match(professor, /controller\?\.cron \|\| ''\) !== '17 \* \* \* \*'/);
  assert.doesNotMatch(professor, /%\s*15\s*===\s*0/);
});

test('internal Dev Bridge has no user-UI auth exceptions', async () => {
  const [professor, ui, index] = await Promise.all([
    source('src/professor-live-learning-entry.js'),
    source('src/pages/full-interface-v2.js'),
    source('src/index.js'),
  ]);

  assert.doesNotMatch(professor, /PROFESSOR_SAFE_DEV_BRIDGE_PATHS/);
  assert.match(professor, /url\.pathname\.startsWith\('\/api\/dev-bridge\/'\)/);
  assert.match(professor, /authorizeDevBridge\(request, env\)/);

  assert.match(ui, /\/api\/work\/health/);
  assert.match(ui, /\/api\/work\/jobs/);
  assert.doesNotMatch(ui, /\/api\/dev-bridge\/health/);
  assert.doesNotMatch(ui, /\/api\/dev-bridge\/jobs/);

  assert.match(index, /\/api\/work\/health/);
  assert.match(index, /\/api\/work\/jobs/);
  assert.doesNotMatch(index, /\/api\/dev-bridge\/health/);
  assert.doesNotMatch(index, /\/api\/dev-bridge\/jobs/);
});
