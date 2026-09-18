import { test } from 'node:test';
import assert from 'node:assert/strict';
import { onRequestGet as normalMvp } from '../src/pages/mvp-interface.js';
import { onRequestGet as professorPage } from '../src/pages/full-interface-v2.js';
import { enhanceThemeAvatars } from '../src/pages/theme-avatar-enhancer.js';
import { applyMelThemeBackgrounds } from '../src/pages/mel-theme-backgrounds.js';
import { NORMAL_RUNTIME_SOURCE } from '../src/pages/mvp-runtime.js';

const expectedThemes = ['classic','granada','guadix','crusade','aviation','amazon','paladin','futuristic'];

function count(haystack, needle) {
  return haystack.split(needle).length - 1;
}

test('normal mode has one visual owner and exactly the eight requested themes', async () => {
  const response = await normalMvp({});
  const html = await response.text();
  assert.equal(response.status, 200);
  assert.equal(count(html, 'id="mel-normal-v3-style"'), 1);
  assert.equal(count(html, 'src="/normal-runtime.js?v=5"'), 1);
  assert.equal(count(html, 'data-mel-theme-choice='), 8);
  for (const theme of expectedThemes) assert.match(html, new RegExp(`data-mel-theme-choice="${theme}"`));
  assert.match(html, /Bibliothèque/);
  assert.match(html, /Granada · Cathédrale/);
  assert.match(html, /Guadix · Virgen de Gracia/);
  assert.match(html, /Croisés · Jérusalem/);
  assert.match(html, /Aviation · 1940/);
  assert.match(html, /Diablo · Amazone · Acte I/);
  assert.match(html, /Diablo · Paladin · Acte IV/);
  assert.match(html, />Futuriste</);
});

test('normal mode uses the new stable real-image assets and clean avatar clipping', async () => {
  const html = await (await normalMvp({})).text();
  assert.match(html, /mel-bg-granada-cathedral-hd\.jpg/);
  assert.match(html, /mel-bg-guadix-virgen-gracia-hd\.jpg/);
  assert.match(html, /mel-bg-crusade-jerusalem-hd\.jpg/);
  assert.match(html, /mel-bg-aviation-1940-hd\.jpg/);
  assert.match(html, /data-mel-theme-choice="futuristic"[^>]+data-mel-avatar="\/assets\/avatars\/mel-full\.webp"/);
  assert.match(html, /transform:none/);
  assert.match(html, /clip-path:circle\(50%\)/);
  assert.match(NORMAL_RUNTIME_SOURCE, /if\(v==='religious'\)v='guadix'/);
  assert.doesNotMatch(html, /mel-theme-decor-style|mel-theme-avatar-runtime|mel-normal-shell-v2-style/);
  assert.doesNotMatch(html, /body:before|body:after|avatar-wrap:before/);
});

test('Professor mode remains theme-free', async () => {
  const html = await (await professorPage({})).text();
  assert.doesNotMatch(html, /data-mel-theme-choice|data-theme-choice|themePanelV3|mel-normal-v3-style|normal-runtime\.js/);
  assert.doesNotMatch(html, /mel-bg-granada|mel-bg-guadix|mel-bg-crusader|mel-bg-aviation-bf109|mel-bg-amazon|mel-bg-paladin/);
  assert.match(html, /Mode complet/);
});

test('retired visual injectors are transparent compatibility shims', async () => {
  const a = new Response('<html><body>normal</body></html>', { headers: { 'content-type': 'text/html' } });
  const b = new Response('<html><body>professor</body></html>', { headers: { 'content-type': 'text/html' } });
  assert.equal(await enhanceThemeAvatars(a), a);
  assert.equal(await applyMelThemeBackgrounds(b), b);
});
