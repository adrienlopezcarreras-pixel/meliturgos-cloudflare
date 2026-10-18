import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const finalEntry = await readFile(new URL('../src/visual-final-entry.js', import.meta.url), 'utf8');
const previewAuth = await readFile(new URL('../src/preview-auth-entry.js', import.meta.url), 'utf8');
const liveEntry = await readFile(new URL('../src/professor-live-learning-entry.js', import.meta.url), 'utf8');
const mvp = await readFile(new URL('../src/pages/mvp-interface-v3.js', import.meta.url), 'utf8');
const mvpRuntime = await readFile(new URL('../src/pages/mvp-runtime.js', import.meta.url), 'utf8');
const wrangler = await readFile(new URL('../wrangler.jsonc', import.meta.url), 'utf8');


test('canonical normal V3 is the single theme and avatar owner', () => {
  assert.match(mvp, /data-visual-owner="mel-normal-v3"/);
  assert.match(mvp, /id="mel-normal-v3-style"/);
  assert.match(mvp, /src="\/normal-runtime\.js\?v=9"/);
  assert.match(mvp, /id="melAvatar" class="avatar"/);
  assert.match(mvp, /id="themePanelV3"/);
  assert.doesNotMatch(mvp, /mel-theme-avatar-runtime/);
  assert.doesNotMatch(mvp, /mel-theme-decor-style/);

  for (const id of ['classic','granada','guadix','crusade','aviation','amazon','paladin','futuristic']) {
    assert.match(mvp, new RegExp(`id:'${id}'`));
  }
  assert.match(mvpRuntime, /v==='religious'\)v='guadix'/);
  assert.match(mvp, /overflow:hidden/);
  assert.match(mvp, /object-fit:cover/);
  assert.match(mvp, /transform:none/);
  assert.match(mvp, /clip-path:circle\(50%\)/);
});
