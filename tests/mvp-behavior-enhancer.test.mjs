import test from 'node:test';
import assert from 'node:assert/strict';
import { enhanceMvpBehavior, MVP_BEHAVIOR_PATCH } from '../src/pages/mvp-behavior-enhancer.js';
import { buildMelIdentityPrompt } from '../src/identity/mel-persona.js';

test('MVP behavior enhancer injects clickable continuation text and bounded chat retry policy', async () => {
  const source = new Response('<html><body><textarea id="input"></textarea><div id="messages"></div><button id="send">Envoyer</button></body></html>', {
    headers: { 'content-type': 'text/html; charset=utf-8' }
  });
  const enhanced = await enhanceMvpBehavior(source);
  const html = await enhanced.text();
  assert.match(html, /Continuer depuis la dernière phrase/);
  assert.match(html, /CHAT_TIMEOUT_MS=120000/);
  assert.match(html, /CHAT_ATTEMPTS=2/);
  assert.match(html, /502,503,504/);
  assert.match(html, /role','link/);
  assert.doesNotMatch(html, /<button[^>]*>Continuer depuis la dernière phrase/i);
});

test('MVP final layout keeps MEL alone at top and utilities at bottom', async () => {
  const source = `<!doctype html><html><body>
    <div class="theme-switch"><button id="themeButton"></button><div id="themePanel"></div></div>
    <main class="app"><div class="avatar-wrap"><div id="avatar"></div></div><div id="voiceStatus">Touchez son visage pour parler</div>
    <section class="window"><div id="messages"></div><div class="composer"><textarea id="input"></textarea><div class="drop" id="drop"><input id="fileInput" type="file"></div><div class="controls"><button id="send">Envoyer</button><button id="full">Mode complet</button></div><div id="status"></div></div></section></main>
  </body></html>`;
  const html = await (await enhanceMvpBehavior(new Response(source, { headers: { 'content-type': 'text/html' } }))).text();
  assert.match(html, /mel-title/);
  assert.match(html, /title\.textContent='MEL'/);
  assert.match(html, /melBottomTools/);
  assert.match(html, /Audit MEL/);
  assert.match(html, /\/api\/gen2\/readiness\?refresh=1/);
  assert.match(html, /\/api\/memory\/status/);
  assert.match(html, /\.drop\{display:block!important\}/);
  assert.match(html, /mel-bottom-tools #full/);
  assert.doesNotMatch(html, /\.drop,#fileInput\{display:none/);
});

test('MVP behavior enhancer is idempotent and ignores non-html responses', async () => {
  const first = await enhanceMvpBehavior(new Response('<html><body><textarea id="input"></textarea></body></html>', { headers: { 'content-type': 'text/html' } }));
  const second = await enhanceMvpBehavior(first);
  const html = await second.text();
  assert.equal((html.match(/mel-mvp-behavior-runtime/g) || []).length, 1);

  const json = new Response('{"ok":true}', { headers: { 'content-type': 'application/json' } });
  assert.equal(await (await enhanceMvpBehavior(json)).text(), '{"ok":true}');
});

test('MVP behavior patch normalizes user bubble label to Adrien', () => {
  assert.match(MVP_BEHAVIOR_PATCH, /replace\(\/\^Vous\/i,'Adrien'\)/);
});

test('MEL persona permanently tutoyers Adrien and treats capability manifest as operational memory', () => {
  const prompt = buildMelIdentityPrompt();
  assert.match(prompt, /Adrien/);
  assert.match(prompt, /tutoies toujours/);
  assert.match(prompt, /CAPABILITY_MANIFEST/);
  assert.match(prompt, /mémoire opérationnelle/);
});
