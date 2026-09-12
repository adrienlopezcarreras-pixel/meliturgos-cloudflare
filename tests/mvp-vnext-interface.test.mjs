import test from 'node:test';
import assert from 'node:assert/strict';
import { MVP_BEHAVIOR_PATCH, enhanceMvpBehavior } from '../src/pages/mvp-behavior-enhancer.js';
import { onRequestGet as renderMvpV2 } from '../src/pages/mvp-interface-v2.js';

test('normal mode does not expose unimplemented server voice or file routes', () => {
  assert.doesNotMatch(MVP_BEHAVIOR_PATCH, /\/api\/voice\/transcribe/);
  assert.doesNotMatch(MVP_BEHAVIOR_PATCH, /\/api\/files\/(?:analyze|upload)/);
  assert.doesNotMatch(MVP_BEHAVIOR_PATCH, /MediaRecorder|getUserMedia/);
  assert.match(MVP_BEHAVIOR_PATCH, /\.drop,#fileInput/);
});

test('normal mode keeps useful continue and compact audit functions', () => {
  assert.match(MVP_BEHAVIOR_PATCH, /Continuer depuis la dernière phrase/);
  assert.match(MVP_BEHAVIOR_PATCH, /Audit MEL/);
  assert.match(MVP_BEHAVIOR_PATCH, /\/api\/gen2\/readiness\?refresh=1/);
  assert.match(MVP_BEHAVIOR_PATCH, /\/api\/memory\/status/);
  assert.doesNotMatch(MVP_BEHAVIOR_PATCH, /interaction_count/i);
});

test('MVP behavior enhancer injects runtime once', async () => {
  const source = '<!doctype html><html><body><main><div id="avatar"></div><div id="voiceStatus"></div><div id="messages"></div><textarea id="input"></textarea><div id="drop"><input id="fileInput" type="file"></div><button id="send">Envoyer</button><div id="status"></div></main></body></html>';
  const once = await enhanceMvpBehavior(new Response(source, { headers: { 'content-type': 'text/html; charset=utf-8' } }));
  const html = await once.text();
  assert.match(html, /mel-mvp-behavior-runtime/);
  assert.match(html, /mel-audit/);
  const twice = await enhanceMvpBehavior(new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8' } }));
  assert.equal(((await twice.text()).match(/id="mel-mvp-behavior-runtime"/g) || []).length, 1);
});

test('normal-mode entrypoint includes the audited behavior layer', async () => {
  const html = await (await renderMvpV2({})).text();
  assert.match(html, /id="mel-mvp-behavior-runtime"/);
  assert.match(html, /Audit MEL/);
  assert.doesNotMatch(html, /\/api\/voice\/transcribe|\/api\/files\/analyze/);
});
