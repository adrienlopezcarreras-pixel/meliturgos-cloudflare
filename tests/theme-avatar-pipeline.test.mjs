import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const finalEntry = await readFile(new URL('../src/visual-final-entry.js', import.meta.url), 'utf8');
const previewAuth = await readFile(new URL('../src/preview-auth-entry.js', import.meta.url), 'utf8');
const liveEntry = await readFile(new URL('../src/professor-live-learning-entry.js', import.meta.url), 'utf8');
const mvp = await readFile(new URL('../src/pages/mvp-interface.js', import.meta.url), 'utf8');
const enhancer = await readFile(new URL('../src/pages/theme-avatar-enhancer.js', import.meta.url), 'utf8');
const wrangler = await readFile(new URL('../wrangler.jsonc', import.meta.url), 'utf8');

test('deployed entrypoint makes the final visual owner outermost while preserving preview auth below it', () => {
  assert.match(wrangler, /"main"\s*:\s*"src\/visual-final-entry\.js"/);
  assert.match(finalEntry, /import app from '\.\/preview-auth-entry\.js';/);
  assert.match(previewAuth, /import app from '\.\/professor-live-learning-entry\.js';/);
  assert.match(previewAuth, /bridgePreviewBasicAuth\(request, env\)/);
  assert.match(finalEntry, /const NORMAL_PATHS = new Set\(\['\/', '\/mvp'\]\)/);
  assert.match(finalEntry, /stripLegacyVisualLayers/);
  assert.match(finalEntry, /if \(NORMAL_PATHS\.has\(pathname\)\)/);
  assert.match(finalEntry, /mel-theme-decor-style/);
  assert.match(finalEntry, /mel-theme-avatar-runtime/);
  assert.match(liveEntry, /import \{ enhanceThemeAvatars \} from '\.\/pages\/theme-avatar-enhancer\.js';/);
});

test('normal MEL shell keeps functional theme hooks while final owner replaces the old seven-theme presentation', () => {
  assert.match(mvp, /id="melAvatar" class="avatar"/);
  assert.match(mvp, /id="themePanelV2"/);
  assert.match(mvp, /id="mel-normal-shell-v2-style"/);
  assert.doesNotMatch(mvp, /id="avatar" class="avatar"/);

  for (const id of ['classic','granada','guadix','crusade','aviation','diablo','paladin','futuristic']) {
    assert.match(finalEntry, new RegExp(`\\b${id}\\b`));
  }
  assert.match(finalEntry, /religious:'guadix',amazon:'diablo'/);
  assert.match(finalEntry, /avatar-wrap::before,.avatar-wrap::after,.avatar::before,.avatar::after/);
  assert.match(finalEntry, /avatar>img~img/);

  // The historical enhancer may remain as compatibility source code, but the
  // final deployed layer strips its output so it cannot stack in the browser.
  assert.match(enhancer, /id="mel-theme-avatar-runtime"/);
  assert.match(enhancer, /mel-theme-decor-style/);
});
