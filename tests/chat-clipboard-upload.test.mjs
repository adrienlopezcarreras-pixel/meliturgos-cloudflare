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

test('generated Normal upload handler stages image and text files, and surfaces rejection without staging', async () => {
  // Exercise the JavaScript actually delivered to the browser, not the
  // source string: a lost regex escape once caused "i is not defined" here.
  const start = NORMAL_RUNTIME_SOURCE.indexOf('async function handleFiles(');
  const end = NORMAL_RUNTIME_SOURCE.indexOf('\ninitVoice();', start);
  assert.ok(start >= 0 && end > start, 'generated upload handler must exist');
  const handlerSource = NORMAL_RUNTIME_SOURCE.slice(start, end);
  const compile = new Function(
    'FormData', 'fetch', 'status', 'add', 'input', 'pendingFiles', 'renderPendingFiles', 'localPhotoPreview',
    handlerSource + '; return handleFiles;',
  );

  for (const [type, expectedImage] of [['image/png', true], ['text/plain', false]]) {
    const pendingFiles = [];
    const uploads = [];
    const messages = [];
    const status = { textContent: '' };
    let renders = 0;
    class TestFormData {
      append(name, file) { uploads.push({ name, file }); }
    }
    const handleFiles = compile(
      TestFormData,
      async (url, options) => {
        assert.equal(url, '/api/files/upload');
        assert.equal(options.method, 'POST');
        assert.ok(options.body instanceof TestFormData);
        return {
          ok: true,
          json: async () => ({
            ok: true, id: 'staged-id', stored: true,
            analysis_status: expectedImage ? 'IMAGE_DESCRIBED' : 'TEXT_EXTRACTED',
            preview_text: expectedImage ? '' : 'Texte du fichier',
          }),
        };
      },
      status, (role, text) => messages.push({ role, text }), { value: '' },
      pendingFiles, () => { renders += 1; },
      async () => expectedImage ? 'blob:preview' : null,
    );
    const file = { name: expectedImage ? 'photo.png' : 'notes.txt', type };
    await handleFiles([file], 'file-picker');
    assert.equal(uploads.length, 1);
    assert.equal(uploads[0].name, 'file');
    assert.equal(uploads[0].file, file);
    assert.equal(pendingFiles.length, 1);
    assert.equal(pendingFiles[0].isImage, expectedImage);
    assert.equal(pendingFiles[0].id, 'staged-id');
    assert.equal(pendingFiles[0].localUrl, expectedImage ? 'blob:preview' : null);
    assert.equal(renders, 1);
    assert.match(status.textContent, /pièce jointe prête/);
    assert.deepEqual(messages, [{ role: 'user', text: '📎 ' + file.name }]);
  }

  const pendingFiles = [];
  const status = { textContent: '' };
  const handleRejected = compile(
    class { append() {} },
    async () => ({ ok: false, json: async () => ({ code: 'FILE_TOO_LARGE' }) }),
    status, () => {}, { value: '' }, pendingFiles, () => {}, async () => null,
  );
  await handleRejected([{ name: 'oversized.txt', type: 'text/plain' }]);
  assert.equal(pendingFiles.length, 0);
  assert.match(status.textContent, /Échec du fichier.*FILE_TOO_LARGE/);
});
