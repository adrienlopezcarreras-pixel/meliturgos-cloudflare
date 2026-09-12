import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { getMelAvatarRoute, serveMelAvatar } from '../src/pages/mel-avatar-assets.js';
import { enhanceThemeAvatars } from '../src/pages/theme-avatar-enhancer.js';

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

test('theme enhancer keeps seven themes reachable and uses approved remote MEL portrait series', async () => {
  const source = '<!doctype html><html data-theme="classic"><body><div class="theme-switch"><button id="themeButton"></button><div id="themePanel"><button data-theme-choice="classic">Classique</button><button data-theme-choice="crusade">Croisés</button><button data-theme-choice="religious">Religieux</button><button data-theme-choice="granada">Grenade</button><button data-theme-choice="aviation">Aviation</button><button data-theme-choice="paladin">Paladin</button><button data-theme-choice="amazon">Amazon</button></div></div><main class="app"><div class="avatar-wrap"><div id="avatar" class="avatar"><img src="/meliturgos-avatar-fille.png" alt="MEL"></div></div><section class="window"><div id="messages"></div><div class="composer"><textarea id="input" maxlength="100000"></textarea><div class="controls"><button id="send">Envoyer</button><button id="full">Mode complet</button></div></div></section><div id="melBottomTools" class="mel-bottom-tools"></div></main></body></html>';
  const response = await enhanceThemeAvatars(new Response(source, { headers: { 'content-type': 'text/html; charset=utf-8' } }));
  const html = await response.text();
  assert.match(html, /mel-theme-avatar-runtime/);
  assert.match(html, /mel-theme-decor-style/);
  for (const name of ['classic','crusade','religious','granada','aviation','paladin','amazon']) {
    assert.match(html, new RegExp(`mel-${name}-v3\\.webp`));
  }
  assert.match(html, /--mel-hd-bg/);
  assert.match(html, /filter:blur\(30px\)/);
  assert.match(html, /background-size:cover!important/);
  assert.match(html, /theme-orb::after\{content:'Thèmes'/);
  assert.match(html, /position:fixed!important/);
  assert.match(html, /body\.ui_theme/);
  assert.match(html, /body\.intent_context/);
  assert.match(html, /object-fit:cover!important/);
  assert.match(html, /maxlength','100000/);
  assert.doesNotMatch(html, /const choices=/);
  assert.doesNotMatch(html, /renderChoices/);
  assert.doesNotMatch(html, /mel-idle-status/);
  assert.equal((html.match(/data-theme-choice=/g) || []).length, 7, 'enhancer must not clone or replace theme choices');
});

test('theme enhancer ignores unrelated HTML and non-HTML responses', async () => {
  const unrelated = new Response('<html><body><div id="avatar"></div></body></html>', { headers: { 'content-type': 'text/html' } });
  const unchanged = await enhanceThemeAvatars(unrelated);
  assert.doesNotMatch(await unchanged.text(), /mel-theme-avatar-runtime/);

  const original = Response.json({ ok: true });
  const enhanced = await enhanceThemeAvatars(original);
  assert.equal(enhanced, original);
});
