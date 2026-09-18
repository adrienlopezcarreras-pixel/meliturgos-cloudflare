import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const finalEntry = await readFile(new URL('../src/visual-final-entry.js', import.meta.url), 'utf8');
const previewAuth = await readFile(new URL('../src/preview-auth-entry.js', import.meta.url), 'utf8');
const liveEntry = await readFile(new URL('../src/professor-live-learning-entry.js', import.meta.url), 'utf8');
const mvpEntry = await readFile(new URL('../src/pages/mvp-interface.js', import.meta.url), 'utf8');
const mvp = await readFile(new URL('../src/pages/mvp-interface-v3.js', import.meta.url), 'utf8');
const mvpRuntime = await readFile(new URL('../src/pages/mvp-runtime.js', import.meta.url), 'utf8');
const enhancer = await readFile(new URL('../src/pages/theme-avatar-enhancer.js', import.meta.url), 'utf8');
const wrangler = await readFile(new URL('../wrangler.jsonc', import.meta.url), 'utf8');

test('deployed entrypoint keeps preview auth and strips retired visual layers without injecting a second owner', () => {
  assert.match(wrangler, /"main"\s*:\s*"src\/visual-final-entry\.js"/);
  assert.match(finalEntry, /import app from '\.\/preview-auth-entry\.js';/);
  assert.match(previewAuth, /import app from '\.\/professor-live-learning-entry\.js';/);
  assert.match(previewAuth, /bridgePreviewBasicAuth\(request, env\)/);
  assert.match(finalEntry, /const NORMAL_PATHS = new Set\(\['\/', '\/mvp'\]\)/);
  assert.match(finalEntry, /stripLegacyVisualLayers/);
  assert.match(finalEntry, /normalizeCanonicalNormalAssets/);
  assert.doesNotMatch(finalEntry, /NORMAL_CANONICAL_STYLE/);
  assert.doesNotMatch(finalEntry, /NORMAL_CANONICAL_RUNTIME/);
  assert.doesNotMatch(finalEntry, /appendBeforeHead/);
  assert.doesNotMatch(finalEntry, /appendBeforeBody/);
  assert.doesNotMatch(liveEntry, /enhanceThemeAvatars/);
  assert.match(enhancer, /return response/);
  assert.match(finalEntry, /return app\.fetch\(request, env, ctx\)/);
});

test('canonical normal V3 is the single theme and avatar owner', () => {
  assert.match(mvpEntry, /export \{ onRequestGet \} from '\.\/mvp-interface-v3\.js';/);
  assert.match(mvp, /data-visual-owner="mel-normal-v3"/);
  assert.match(mvp, /id="mel-normal-v3-style"/);
  assert.match(mvp, /src="\/normal-runtime\.js\?v=5"/);
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
