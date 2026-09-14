import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);

async function text(path) {
  return readFile(new URL(path, root), 'utf8');
}

test('production entry routes through the release UI repair wrapper', async () => {
  const wrangler = await text('wrangler.jsonc');
  assert.match(wrangler, /"main"\s*:\s*"src\/ui-release-fix-entry\.js"/);
});

test('full mode forces the embedded MEL portrait and explains live states', async () => {
  const source = await text('src/ui-release-fix-entry.js');
  assert.match(source, /fullAvatar/);
  assert.match(source, /\.brand img,\.hero img/);
  assert.match(source, /mel-live-explanation/);
  for (const status of ['QUEUED','CLAIMED','WAITING_TEACHER','READY_FOR_REVIEW','COMPLETED','FAILED']) {
    assert.ok(source.includes(status), `missing live explanation for ${status}`);
  }
});

test('all owner themes and full control mode use self-contained 4K backgrounds', async () => {
  const source = await text('src/assets/generated/hd-backgrounds.js');
  assert.match(source, /viewBox="0 0 3840 2160"/);
  for (const theme of ['classic','crusade','religious','granada','aviation','paladin','amazon','control']) {
    assert.match(source, new RegExp(`\\b${theme}\\b`));
  }
});

test('service worker is network-first and never caches API reads', async () => {
  const source = await text('src/pages/service-worker.js');
  assert.match(source, /meliturgos-gen2-v4/);
  assert.match(source, /networkFirst/);
  assert.match(source, /pathname\.startsWith\('\/api\/'\)/);
  assert.match(source, /skipWaiting/);
});
