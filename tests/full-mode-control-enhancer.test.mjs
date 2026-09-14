import test from 'node:test';
import assert from 'node:assert/strict';
import { enhanceFullModeControls } from '../src/pages/full-mode-control-enhancer.js';
import { enhanceMvpBehavior } from '../src/pages/mvp-behavior-enhancer.js';

test('full mode receives MAX, STOP, activity and a clickable recall line', async () => {
  const source = new Response(`<!doctype html><html><body>
    <header class="top"><h1>Mode complet</h1></header>
    <section data-panel="chat"><div id="chatlog"></div><div class="composer"><input id="chatInput"><button id="chatSend">Envoyer</button></div><div id="chatStatus"></div></section>
  </body></html>`, { headers: { 'content-type': 'text/html; charset=utf-8' } });
  const html = await (await enhanceFullModeControls(source)).text();
  assert.match(html, /melFullMax/);
  assert.match(html, /MAX 100%/);
  assert.match(html, /melFullStop/);
  assert.match(html, /melFullActivity/);
  assert.match(html, /Reprendre la dernière conversation/);
  assert.match(html, /role','link/);
  assert.doesNotMatch(html, /<button[^>]*>Reprendre la dernière conversation/i);
});

test('normal mode keeps recall as text and does not receive autonomy buttons', async () => {
  const source = new Response(`<!doctype html><html><body>
    <main class="app"><div class="avatar-wrap"></div><section class="window"><div id="messages"></div><div class="composer"><textarea id="input"></textarea><div class="controls"><button id="send">Envoyer</button><button id="full">Mode complet</button></div><div id="status"></div></div></section></main>
  </body></html>`, { headers: { 'content-type': 'text/html; charset=utf-8' } });
  const html = await (await enhanceMvpBehavior(source)).text();
  assert.match(html, /Reprendre la dernière conversation/);
  assert.match(html, /mel-recall-link/);
  assert.doesNotMatch(html, /melFullMax/);
  assert.doesNotMatch(html, /melMaxAutonomy/);
  assert.doesNotMatch(html, /<button[^>]*>Reprendre la dernière conversation/i);
});

test('MVP enhancer delegates full-mode HTML to the full-mode enhancer', async () => {
  const source = new Response(`<!doctype html><html><body><header class="top"></header><section data-panel="chat"><div id="chatlog"></div><div class="composer"><input id="chatInput"><button id="chatSend">Envoyer</button></div></section></body></html>`, { headers: { 'content-type': 'text/html' } });
  const html = await (await enhanceMvpBehavior(source)).text();
  assert.match(html, /mel-full-control-runtime/);
  assert.match(html, /melFullMax/);
  assert.doesNotMatch(html, /mel-mvp-behavior-runtime/);
});
