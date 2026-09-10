import test from 'node:test';
import assert from 'node:assert/strict';
import { getMelAvatarRoute, serveMelAvatar } from '../src/pages/mel-avatar-assets.js';
import { enhanceThemeAvatars } from '../src/pages/theme-avatar-enhancer.js';

test('each MEL visual mode resolves to its dedicated embedded avatar', async () => {
  const cases = [
    ['classic', '/assets/avatars/mel-classic.webp', 'classic'],
    ['crusade', '/assets/avatars/mel-crusade.webp', 'crusade'],
    ['religious', '/assets/avatars/mel-religious-andalusian.webp', 'religious'],
  ];
  for (const [theme, path, header] of cases) {
    assert.equal(getMelAvatarRoute(theme), path);
    const response = serveMelAvatar(path);
    assert.ok(response instanceof Response);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'image/webp');
    assert.equal(response.headers.get('x-mel-avatar'), header);
    const bytes = new Uint8Array(await response.arrayBuffer());
    assert.ok(bytes.length > 3000);
    assert.equal(String.fromCharCode(...bytes.slice(0, 4)), 'RIFF');
    assert.equal(String.fromCharCode(...bytes.slice(8, 12)), 'WEBP');
  }
  assert.equal(serveMelAvatar('/assets/avatars/unknown.webp'), null);
});

test('HTML enhancer synchronizes avatars, theme context and decor', async () => {
  const source = '<!doctype html><html data-theme="classic"><body><div class="avatar-wrap"><div class="avatar"><img src="/meliturgos-avatar-fille.png" alt="MEL"></div></div><div id="voiceStatus"></div><section class="window"><button id="skills">Compétences</button><div id="skillsPanel"></div></section></body></html>';
  const response = await enhanceThemeAvatars(new Response(source, { headers: { 'content-type': 'text/html; charset=utf-8' } }));
  const html = await response.text();
  assert.match(html, /mel-theme-avatar-runtime/);
  assert.match(html, /mel-theme-decor-style/);
  assert.match(html, /mel-classic\.webp/);
  assert.match(html, /mel-crusade\.webp/);
  assert.match(html, /mel-religious-andalusian\.webp/);
  assert.match(html, /data-theme-choice=\"granada\"/);
  assert.match(html, /Cathédrale de Grenade/);
  assert.match(html, /MEL veille et prie en silence/);
  assert.match(html, /MEL demeure dans une prière paisible/);
  assert.match(html, /MEL demeure dans la lumière du sanctuaire/);
  assert.match(html, /#skills,#skillsPanel\{display:none!important\}/);
  assert.match(html, /\.window:after[^}]*content:none!important/);
  assert.match(html, /document\.getElementById\('skills'\)\?\.remove/);
  assert.match(html, /MutationObserver/);
  assert.match(html, /body\.ui_theme/);
  assert.match(html, /body\.intent_context/);
});

test('non-HTML responses are not rewritten by theme enhancer', async () => {
  const original = Response.json({ ok: true });
  const enhanced = await enhanceThemeAvatars(original);
  assert.equal(enhanced, original);
});
