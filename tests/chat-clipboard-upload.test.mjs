import test from 'node:test';
import assert from 'node:assert/strict';
import { NORMAL_RUNTIME_SOURCE } from '../src/pages/mvp-runtime.js';
import { onRequestGet as renderFullInterface } from '../src/pages/full-interface-v2.js';
import { onRequestGet as renderMvpInterfaceV3 } from '../src/pages/mvp-interface-v3.js';

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
  assert.match(html, /input_source:staged\[0\]\?\.source\|\|source/);
});


test('full chat stages uploaded attachments and allows removal before explicit send', async () => {
  const response = await renderFullInterface();
  const html = await response.text();
  assert.match(html, /id="chatAttachments"/);
  assert.match(html, /const pendingChatFiles=\[\]/);
  assert.match(html, /pendingChatFiles\.push/);
  assert.match(html, /pendingChatFiles\.splice\(index,1\)/);
  assert.match(html, /Retirer /);
  assert.match(html, /const staged=pendingChatFiles\.splice\(0\)/);
  assert.match(html, /if\(!text&&!staged\.length\)return/);
});


test('normal chat stages uploaded attachments and allows removal before explicit send', async () => {
  const response = await renderMvpInterfaceV3();
  const html = await response.text();
  assert.match(html, /id="attachments"/);
  assert.match(NORMAL_RUNTIME_SOURCE, /pendingFiles=\[\]/);
  assert.match(NORMAL_RUNTIME_SOURCE, /pendingFiles\.push/);
  assert.match(NORMAL_RUNTIME_SOURCE, /pendingFiles\.splice\(index,1\)/);
  assert.match(NORMAL_RUNTIME_SOURCE, /const original=.*staged=pendingFiles\.splice\(0\)/);
  assert.match(NORMAL_RUNTIME_SOURCE, /pièce jointe prête/);
});

test('normal runtime preserves image MIME regex after JS string generation', () => {
  // Regression: a single source-level backslash disappears in the generated
  // script, making '/^image//i.test(...)' evaluate an undefined variable i.
  const imagePredicate = String.raw`/^image\//i.test(file.type)`;
  assert.equal(NORMAL_RUNTIME_SOURCE.split(imagePredicate).length - 1, 2);
  assert.equal(NORMAL_RUNTIME_SOURCE.includes('/^image//i.test(file.type)'), false);
  const expression = NORMAL_RUNTIME_SOURCE.match(/isImage:(.*?),analysisStatus:/)?.[1];
  assert.equal(expression, imagePredicate);
  const matchMime = new Function('file', 'return ' + expression);
  assert.equal(matchMime({type:'image/jpeg'}), true);
  assert.equal(matchMime({type:'application/pdf'}), false);
});

test('full chat generated image MIME predicate executes without undefined i and identifies files', async () => {
  const response = await renderFullInterface();
  const html = await response.text();
  const at = html.indexOf('isImage:');
  assert.ok(at >= 0, 'rendered chat must contain file image predicate');
  const end = html.indexOf(',localUrl', at);
  assert.ok(end > at, 'predicate must be bounded by file item properties');
  const expression = html.slice(at + 'isImage:'.length, end);
  // Compile/evaluate the *rendered* browser expression: source syntax checks
  // do not detect template-literal escape loss before runtime.
  const isImage = new Function('file', 'return (' + expression + ');');
  assert.equal(isImage({type:'image/png'}),true);
  assert.equal(isImage({type:'IMAGE/JPEG'}),true);
  assert.equal(isImage({type:'text/plain'}),false);
  assert.equal(isImage({type:'application/pdf'}),false);
});

