import test from 'node:test';
import assert from 'node:assert/strict';
import { MVP_BEHAVIOR_PATCH, enhanceMvpBehavior } from '../src/pages/mvp-behavior-enhancer.js';

test('MEL vNext behavior uses server transcription instead of relying only on SpeechRecognition', () => {
  assert.match(MVP_BEHAVIOR_PATCH, /MediaRecorder/);
  assert.match(MVP_BEHAVIOR_PATCH, /\/api\/voice\/transcribe/);
  assert.match(MVP_BEHAVIOR_PATCH, /getUserMedia/);
  assert.match(MVP_BEHAVIOR_PATCH, /recording/);
});

test('MEL vNext files use the real analysis endpoint and are carried into the next chat request', () => {
  assert.match(MVP_BEHAVIOR_PATCH, /\/api\/files\/analyze/);
  assert.doesNotMatch(MVP_BEHAVIOR_PATCH, /\/api\/files\/upload/);
  assert.match(MVP_BEHAVIOR_PATCH, /body\.attachments/);
  assert.match(MVP_BEHAVIOR_PATCH, /CONTEXTE DES FICHIERS JOINTS/);
  assert.match(MVP_BEHAVIOR_PATCH, /MAX_FILES=8/);
  assert.match(MVP_BEHAVIOR_PATCH, /MAX_FILE_CONTEXT_CHARS=24000/);
});

test('MEL vNext exposes a compact audit without restoring interaction counters', () => {
  assert.match(MVP_BEHAVIOR_PATCH, /Audit MEL/);
  assert.match(MVP_BEHAVIOR_PATCH, /\/api\/gen2\/readiness\?refresh=1/);
  assert.match(MVP_BEHAVIOR_PATCH, /\/api\/memory\/status/);
  assert.doesNotMatch(MVP_BEHAVIOR_PATCH, /interaction_count/i);
});

test('MVP behavior enhancer injects vNext runtime once into MEL HTML', async () => {
  const source = '<!doctype html><html><body><main><div id="avatar"></div><div id="voiceStatus"></div><div id="messages"></div><textarea id="input"></textarea><div id="drop"><input id="fileInput" type="file"></div><button id="send">Envoyer</button><div id="status"></div></main></body></html>';
  const once = await enhanceMvpBehavior(new Response(source, { headers: { 'content-type': 'text/html; charset=utf-8' } }));
  const html = await once.text();
  assert.match(html, /mel-mvp-behavior-runtime/);
  assert.match(html, /mel-file-tray/);
  assert.match(html, /mel-audit/);

  const twice = await enhanceMvpBehavior(new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8' } }));
  const htmlTwice = await twice.text();
  assert.equal((htmlTwice.match(/id="mel-mvp-behavior-runtime"/g) || []).length, 1);
});
