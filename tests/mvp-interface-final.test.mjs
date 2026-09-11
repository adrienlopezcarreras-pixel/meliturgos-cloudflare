import test from 'node:test';
import assert from 'node:assert/strict';
import entry, { withChatAiDefaults } from '../src/index.js';
import { serveMelBackground, finalizeMvpInterface } from '../src/pages/mvp-finalizer.js';

test('canonical entry keeps worker contracts while adding final interface wrapper', () => {
  assert.equal(typeof entry.fetch, 'function');
  assert.equal(typeof entry.scheduled, 'function');
  assert.equal(typeof withChatAiDefaults, 'function');
});

test('approved chapel artwork is a real decodable WebP asset', async () => {
  const response = serveMelBackground('/assets/backgrounds/mel-chapel-grandiose.webp');
  assert.ok(response);
  assert.equal(response.headers.get('content-type'), 'image/webp');
  assert.equal(response.headers.get('x-mel-background'), 'approved-chapel-grandiose');
  const bytes = new Uint8Array(await response.arrayBuffer());
  assert.ok(bytes.length > 10000);
  assert.equal(String.fromCharCode(...bytes.slice(0, 4)), 'RIFF');
  assert.equal(String.fromCharCode(...bytes.slice(8, 12)), 'WEBP');
});

test('final interface uses real artwork and keeps foreground readable', async () => {
  const source = '<!doctype html><html data-theme="religious"><body><div id="avatar"></div><div id="voiceStatus"></div><div id="messages"></div><textarea id="input"></textarea><button id="send"></button><div id="status"></div></body></html>';
  const response = await finalizeMvpInterface(new Response(source, { headers: { 'content-type': 'text/html; charset=utf-8' } }));
  const html = await response.text();
  assert.match(html, /mel-chapel-grandiose\.webp/);
  assert.match(html, /background-size:cover/);
  assert.match(html, /rgba\(255,250,236,\.965\)/);
});

test('voice click is canonical MediaRecorder flow and old avatar listeners are removed', async () => {
  const source = '<html><body><div id="avatar"></div><div id="voiceStatus">Reconnaissance vocale non disponible dans ce navigateur.</div><textarea id="input"></textarea><button id="send"></button><div id="messages"></div><div id="status"></div></body></html>';
  const response = await finalizeMvpInterface(new Response(source, { headers: { 'content-type': 'text/html' } }));
  const html = await response.text();
  assert.match(html, /cloneNode\(true\)/);
  assert.match(html, /getUserMedia/);
  assert.match(html, /MediaRecorder/);
  assert.match(html, /\/api\/voice\/transcribe/);
  assert.match(html, /Clique sur MEL pour parler/);
  assert.doesNotMatch(html, /window\.SpeechRecognition|window\.webkitSpeechRecognition/);
});

test('last conversation recall is visible and uses archived Gen2 conversations', async () => {
  const source = '<html><body><div id="avatar"></div><div id="voiceStatus"></div><textarea id="input"></textarea><button id="send"></button><div id="messages"></div><div id="status"></div></body></html>';
  const response = await finalizeMvpInterface(new Response(source, { headers: { 'content-type': 'text/html' } }));
  const html = await response.text();
  assert.match(html, /Rappeler la dernière conversation/);
  assert.match(html, /\/api\/gen2\/conversations/);
  assert.match(html, /\/api\/gen2\/conversations\/messages\?conversation_id=/);
  assert.match(html, /localStorage\.setItem\(STORAGE_CONVERSATION/);
});
