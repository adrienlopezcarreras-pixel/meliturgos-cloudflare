import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { fetchPublicWebImage, isWebImageRequest } from '../src/media/web-image.js';
import { handleWebImage } from '../src/api/web-image.js';
import { handleNativeChat } from '../src/api/native-chat.js';
import { CHAT_RICH_RENDERER_SOURCE } from '../src/pages/chat-rich-renderer.js';
import { sqliteD1 } from './helpers/sqlite-d1.mjs';

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9a0AAAAASUVORK5CYII=', 'base64');
const headers = { authorization: 'Basic ' + btoa('test:test-only'), 'content-type': 'application/json' };

test('photo request executes real bus research, resolves the current official portrait, validates and renders it without AI inference', async () => {
  const DB = sqliteD1();
  let modelCalls = 0;
  const fetched = [];
  const env = { DB, MELITURGOS_USER: 'test', MELITURGOS_PASSWORD: 'test-only', MEL_WEB_MIN_INTERVAL_MS: 0,
    AI: { async run() { modelCalls += 1; throw new Error('NO_IMAGE_INFERENCE_NEEDED'); } },
    async MEL_WEB_FETCH(url, options) {
      const value = String(url);
      fetched.push(value);
      assert.equal(options.headers.authorization, undefined);
      if (value.endsWith('/holy-father.html')) return new Response('<a href="/content/pope-current/fr.html">Pape actuel</a>', { headers: { 'content-type': 'text/html' } });
      if (value.endsWith('/pope-current/fr.html')) return new Response('<title>Pape actuel</title><img src="/logo.png"><img src="/portraits/pope-current.png">', { headers: { 'content-type': 'text/html' } });
      assert.equal(value, 'https://www.vatican.va/portraits/pope-current.png');
      return new Response(png, { headers: { 'content-type': 'image/png' } });
    },
  };
  try {
    const response = await handleNativeChat(new Request('https://mel.test/api/chat', {
      method: 'POST', headers, body: JSON.stringify({ text: 'donne moi une photo du pape, affiche la ici', conversation_id: 'photo-proof' }),
    }), env);
    const body = await response.json();
    assert.equal(response.status, 200, JSON.stringify(body));
    assert.equal(body.response_mode, 'web-image');
    assert.match(body.text, /!\[Photographie\]\(https:\/\/www.vatican.va\/portraits\/pope-current.png\)/);
    assert.equal(body.archive_saved, true);
    assert.equal(body.tool_results[0].result.image_validated, true);
    assert.equal(modelCalls, 0);
    assert.equal(fetched.length, 3);
    const dom = new JSDOM('<div id="chat"></div>', { url: 'https://mel.test/', runScripts: 'outside-only' });
    dom.window.eval(CHAT_RICH_RENDERER_SOURCE);
    dom.window.melRenderRichText(dom.window.document.getElementById('chat'), body.text);
    const img = dom.window.document.querySelector('img');
    assert.ok(img);
    assert.equal(new URL(img.src).origin, 'https://mel.test');
    const displayed = await handleWebImage(new Request(img.src, { headers }), env);
    assert.equal(displayed.status, 200);
    assert.equal(displayed.headers.get('content-type'), 'image/png');
    assert.deepEqual(Buffer.from(await displayed.arrayBuffer()), png);
    dom.window.close();
  } finally { DB.close(); }
});

test('image validation refuses pages, forged MIME, SVG, private redirects and oversized streams', async () => {
  for (const [mime, bytes, code] of [
    ['text/html', '<html>Page</html>', 'WEB_IMAGE_CONTENT_TYPE_INVALID'],
    ['image/png', '<svg onload="bad()"/>', 'WEB_IMAGE_MAGIC_INVALID'],
    ['image/svg+xml', '<svg/>', 'WEB_IMAGE_CONTENT_TYPE_INVALID'],
  ]) {
    await assert.rejects(fetchPublicWebImage('https://example.org/image', {
      fetchImpl: async () => new Response(bytes, { headers: { 'content-type': mime } }),
    }), error => error.code === code);
  }
  let calls = 0;
  await assert.rejects(fetchPublicWebImage('https://example.org/redirect', {
    fetchImpl: async () => { calls += 1; return new Response(null, { status: 302, headers: { location: 'http://127.0.0.1/private' } }); },
  }), error => error.code === 'WEB_IMAGE_URL_OR_FETCH_FAILED');
  assert.equal(calls, 1);
  await assert.rejects(fetchPublicWebImage('https://example.org/image', {
    maxBytes: 10, fetchImpl: async () => new Response(png, { headers: { 'content-type': 'image/png' } }),
  }), error => error.code === 'WEB_IMAGE_TOO_LARGE');
});

test('image endpoint requires owner authentication and photo discovery never hijacks generation or private photos', async () => {
  let calls = 0;
  const response = await handleWebImage(new Request('https://mel.test/api/media/web-image?url=https://example.org/image.png'), {
    MELITURGOS_USER: 'test', MELITURGOS_PASSWORD: 'test-only', MEL_WEB_FETCH() { calls += 1; },
  });
  assert.equal(response.status, 401);
  assert.equal(calls, 0);
  assert.equal(isWebImageRequest('Affiche une photo de Paris'), true);
  for (const text of ['Montre mes photos Gmail', 'Génère une image et affiche-la', 'Corrige le bug des images dans le code']) {
    assert.equal(isWebImageRequest(text), false);
  }
});
