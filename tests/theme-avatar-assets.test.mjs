import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { getMelAvatarRoute, serveMelAvatar } from '../src/pages/mel-avatar-assets.js';
import { enhanceThemeAvatars } from '../src/pages/theme-avatar-enhancer.js';
import { onRequestGet as renderNormalMode } from '../src/pages/mvp-interface.js';

const AVATARS = [
  ['classic', '/assets/avatars/mel-classic.webp'],
  ['granada', '/assets/avatars/mel-granada.webp'],
  ['guadix', '/assets/avatars/mel-religious-andalusian.webp'],
  ['crusade', '/assets/avatars/mel-crusade.webp'],
  ['aviation', '/assets/avatars/mel-aviation-1940s.webp'],
  ['amazon', '/assets/avatars/mel-amazon-griffon.webp'],
  ['paladin', '/assets/avatars/mel-paladin-light-full-plate.webp'],
  ['futuristic', '/assets/avatars/mel-full.webp'],
];

function staticAssetUrl(route) {
  return new URL('../dist' + route, import.meta.url);
}

test('each MEL visual mode resolves to a valid static WebP avatar route', async () => {
  for (const [theme, path] of AVATARS) {
    assert.equal(getMelAvatarRoute(theme), path);
    const bytes = await readFile(staticAssetUrl(path));
    assert.ok(bytes.length > 10000, path);
    assert.equal(bytes.subarray(0, 4).toString('ascii'), 'RIFF', path);
    assert.equal(bytes.subarray(8, 12).toString('ascii'), 'WEBP', path);
  }
  assert.equal(serveMelAvatar('/assets/avatars/unknown.webp'), null);
});

test('clean static portraits remain byte-distinct', async () => {
  const hashes = [];
  for (const [, path] of AVATARS) {
    const bytes = await readFile(staticAssetUrl(path));
    hashes.push(createHash('sha256').update(bytes).digest('hex'));
  }
  assert.equal(new Set(hashes).size, AVATARS.length);
});

test('legacy theme enhancer stays transparent while canonical normal page owns eight themes', async () => {
  const source = '<!doctype html><html data-theme="classic"><body><div id="avatar" class="avatar"><img src="/legacy.webp" alt="MEL"></div></body></html>';
  const original = new Response(source, { headers: { 'content-type': 'text/html; charset=utf-8' } });
  const enhanced = await enhanceThemeAvatars(original);
  assert.equal(enhanced, original);
  assert.equal(await enhanced.text(), source);

  const html = await (await renderNormalMode()).text();
  assert.match(html, /data-visual-owner="mel-normal-v3"/);
  assert.match(html, /id="mel-normal-v3-style"/);
  assert.match(html, /src="\/normal-runtime\.js\?v=5"/);
  assert.doesNotMatch(html, /mel-theme-avatar-runtime/);
  assert.doesNotMatch(html, /mel-theme-decor-style/);

  for (const id of ['classic', 'granada', 'guadix', 'crusade', 'aviation', 'amazon', 'paladin', 'futuristic']) {
    assert.match(html, new RegExp('data-mel-theme-choice="' + id + '"'));
  }
  assert.equal((html.match(/data-mel-theme-choice=/g) || []).length, 8);

  for (const [, path] of AVATARS) assert.ok(html.includes(path), 'missing avatar route: ' + path);

  assert.match(html, /object-fit:cover/);
  assert.match(html, /transform:none/);
  assert.match(html, /clip-path:circle\(50%\)/);
  assert.match(html, /maxlength="100000"/);
});

test('theme enhancer ignores unrelated HTML and non-HTML responses', async () => {
  const unrelated = new Response('<html><body><div id="avatar"></div></body></html>', { headers: { 'content-type': 'text/html' } });
  const unchanged = await enhanceThemeAvatars(unrelated);
  assert.equal(unchanged, unrelated);
  assert.doesNotMatch(await unchanged.text(), /mel-theme-avatar-runtime/);

  const original = Response.json({ ok: true });
  const enhanced = await enhanceThemeAvatars(original);
  assert.equal(enhanced, original);
});
