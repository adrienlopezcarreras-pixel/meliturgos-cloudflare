import test from 'node:test';
import assert from 'node:assert/strict';
import { NORMAL_RUNTIME_SOURCE } from '../src/pages/mvp-runtime.js';
import { onRequestGet as renderFullInterface } from '../src/pages/full-interface-v2.js';
import { renderMvpInterfaceV3 } from '../src/pages/mvp-interface-v3.js';

test('normal chat accepts clipboard files without hijacking text-only paste', () => {
  assert.match(NORMAL_RUNTIME_SOURCE, /function filesFromTransfer\(dt\)/);
  assert.match(NORMAL_RUNTIME_SOURCE, /input\.addEventListener\('paste'/);
  assert.match(NORMAL_RUNTIME_SOURCE, /if\(!files\.length\)return;e\.preventDefault\(\);handleFiles\(files,'clipboard'\)/);
  assert.match(NORMAL_RUNTIME_SOURCE, /\/api\/files\/upload/);
  assert.match(NORMAL_RUNTIME_SOURCE, /handleFiles\(filesFromTransfer\(e\.dataTransfer\),'drag-drop'\)/);
});

test('full chat exposes picker and clipboard file ingestion through the same upload API', async () => {
  const response = await renderFullInterface();
  const html = await response.text();
  assert.match(html, /id="chatFileInput" type="file" multiple hidden/);
  assert.match(html, /id="chatAttach"/);
  assert.match(html, /chatInput'\)\.addEventListener\('paste'/);
  assert.match(html, /if\(!files\.length\)return;e\.preventDefault\(\);uploadChatFiles\(files,'clipboard'\)/);
  assert.match(html, /\/api\/files\/upload/);
  assert.match(html, /input_source:source/);
});


test('full chat stages uploaded attachments and allows removal before explicit send', async () => {
  const response = await renderFullInterface();
  const html = await response.text();
  assert.match(html, /id="chatAttachments"/);
  assert.match(html, /const pendingChatFiles=[]/);
  assert.match(html, /pendingChatFiles\.push/);
  assert.match(html, /pendingChatFiles\.splice\(index,1\)/);
  assert.match(html, /Retirer /);
  assert.match(html, /const staged=pendingChatFiles\.splice\(0\)/);
  assert.match(html, /if\(!text&&!staged\.length\)return/);
});


test('normal chat stages uploaded attachments and allows removal before explicit send', async () => {
  const response = renderMvpInterfaceV3();
  const html = await response.text();
  assert.match(html, /id="attachments"/);
  assert.match(NORMAL_RUNTIME_SOURCE, /pendingFiles=\[\]/);
  assert.match(NORMAL_RUNTIME_SOURCE, /pendingFiles\.push/);
  assert.match(NORMAL_RUNTIME_SOURCE, /pendingFiles\.splice\(index,1\)/);
  assert.match(NORMAL_RUNTIME_SOURCE, /const original=.*staged=pendingFiles\.splice\(0\)/);
  assert.match(NORMAL_RUNTIME_SOURCE, /pièce jointe prête/);
});
