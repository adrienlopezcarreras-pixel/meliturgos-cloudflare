import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { getMelAvatarRoute, serveMelAvatar } from '../src/pages/mel-avatar-assets.js';
import { enhanceThemeAvatars } from '../src/pages/theme-avatar-enhancer.js';
import { onRequestGet as renderNormalMode } from '../src/pages/mvp-interface.js';

test('each MEL visual mode resolves to its stable embedded fallback avatar route', async () => {
  const cases = [
    ['classic', '/assets/avatars/mel-classic.webp', 'classic'],
    ['crusade', '/assets/avatars/mel-crusade.webp', 'crusade'],
    ['religious', '/assets/avatars/mel-religious-andalusian.webp', 'religious'],
    ['granada', '/assets/avatars/mel-granada.webp', 'granada'],
    ['aviation', '/assets/avatars/mel-aviation-1940s.webp', 'aviation'],
    ['paladin', '/assets/avatars/mel-paladin-light-full-plate.webp', 'paladin'],
    ['amazon', '/assets/avatars/mel-amazon-griffon.webp', 'amazon'],
  ];
  for (const [theme, path, header] of cases) {
    assert.equal(getMelAvatarRoute(theme), path);
    const response = serveMelAvatar(path);
    assert.ok(response instanceof Response);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'image/webp');
    assert.equal(response.headers.get('x-mel-avatar'), header);
    assert.equal(response.headers.get('cache-control'), 'public,max-age=300,must-revalidate');
    const bytes = new Uint8Array(await response.arrayBuffer());
    assert.ok(bytes.length > 3000);
    assert.equal(String.fromCharCode(...bytes.slice(0, 4)), 'RIFF');
    assert.equal(String.fromCharCode(...bytes.slice(8, 12)), 'WEBP');
  }
  assert.equal(serveMelAvatar('/assets/avatars/unknown.webp'), null);
});

test('embedded fallback portraits remain byte-distinct where dedicated', async () => {
  const dedicated = [
    '/assets/avatars/mel-classic.webp',
    '/assets/avatars/mel-crusade.webp',
    '/assets/avatars/mel-religious-andalusian.webp',
    '/assets/avatars/mel-aviation-1940s.webp',
    '/assets/avatars/mel-paladin-light-full-plate.webp',
    '/assets/avatars/mel-amazon-griffon.webp',
  ];
  const hashes = [];
  for (const path of dedicated) {
    const bytes = Buffer.from(await serveMelAvatar(path).arrayBuffer());
    hashes.push(createHash('sha256').update(bytes).digest('hex'));
  }
  assert.equal(new Set(hashes).size, dedicated.length);
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
  assert.match(html, /id="mel-normal-v3-runtime"/);
  assert.doesNotMatch(html, /mel-theme-avatar-runtime/);
  assert.doesNotMatch(html, /mel-theme-decor-style/);

  for (const id of ['classic','granada','guadix','crusade','aviation','amazon','paladin','futuristic']) {
    assert.match(html, new RegExp(`data-mel-theme-choice="${id}"`));
  }
  assert.equal((html.match(/data-mel-theme-choice=/g) || []).length, 8);

  for (const portrait of [
    'mel-classic-v3.webp',
    'mel-granada-v3.webp',
    'mel-religious-v3.webp',
    'mel-crusade-v3.webp',
    'mel-aviation-v3.webp',
    'mel-amazon-v3.webp',
    'mel-paladin-v3.webp',
    'meliturgos-avatar-fille.png',
  ]) assert.match(html, new RegExp(portrait.replace('.', '\\.')));

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
