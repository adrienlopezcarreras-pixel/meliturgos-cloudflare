import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { onRequestGet as renderMvpV2 } from '../src/pages/mvp-interface-v2.js';

test('normal mode is one canonical runtime without obsolete behavior/finalizer layers', async () => {
  const entry = await readFile(new URL('../src/pages/mvp-interface-v2.js', import.meta.url), 'utf8');
  const html = await (await renderMvpV2({})).text();
  assert.doesNotMatch(entry, /behavior-enhancer|interface-finalizer/);
  assert.doesNotMatch(html, /mel-mvp-behavior-runtime|mel-interface-finalizer-runtime/);
  assert.match(html, /<title>MEL<\/title>/);
});

test('normal mode keeps continuation, compact audit and real file analysis', async () => {
  const html = await (await renderMvpV2({})).text();
  assert.match(html, /Continuer la dernière réponse/);
  assert.match(html, /État de MEL/);
  assert.match(html, /\/api\/gen2\/readiness\?refresh=1/);
  assert.match(html, /\/api\/memory\/status/);
  assert.match(html, /\/api\/files\/analyze/);
  assert.doesNotMatch(html, /\/api\/files\/upload/);
  assert.doesNotMatch(html, /interaction_count/i);
});

test('normal mode does not add a second server voice path', async () => {
  const html = await (await renderMvpV2({})).text();
  assert.doesNotMatch(html, /\/api\/voice\/transcribe/);
  assert.match(html, /SpeechRecognition|webkitSpeechRecognition/);
  assert.match(html, /avatar\.addEventListener\('click'/);
});
