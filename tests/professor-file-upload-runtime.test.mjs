import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequestGet as renderProfessor } from '../src/pages/full-interface-v2.js';

// [ChatGPT-GPT6] Execute the cooked browser JavaScript, not the template source.
// A single slash escaping error turned /^image\\// into a malformed generated
// expression and left successful MEL-FILE uploads invisible in Professor.
test('Professor browser upload handler stages a real successful text and image upload', async () => {
  const html = await (await renderProfessor()).text();
  const start = html.indexOf('async function uploadChatFiles(');
  const end = html.indexOf('async function resumeLatestConversation()', start);
  assert.ok(start >= 0 && end > start, 'the emitted upload handler is present');
  const handler = html.slice(start, end);
  const compile = new Function(
    'qs', 'fetch', 'FormData', 'localPhotoPreview', 'pendingChatFiles', 'renderPendingChatFiles',
    handler + ';return uploadChatFiles;',
  );
  for (const [type, expectedImage] of [['text/plain', false], ['image/png', true]]) {
    const pending = [];
    const requests = [];
    const status = { textContent: '' };
    let renders = 0;
    class TestFormData { append(name, file) { requests.push({ name, file }); } }
    const upload = compile(
      selector => { assert.equal(selector, '#chatStatus'); return status; },
      async (url, options) => {
        assert.equal(url, '/api/files/upload');
        assert.equal(options.method, 'POST');
        assert.equal(options.credentials, 'same-origin');
        assert.ok(options.body instanceof TestFormData);
        return { ok: true, json: async () => ({
          id: 'file-proof', stored: true, stored_encrypted: true,
          analysis_status: expectedImage ? 'IMAGE_DESCRIBED' : 'TEXT_EXTRACTED',
          preview_text: expectedImage ? '' : 'Texte réel',
        }) };
      },
      TestFormData, async () => null, pending, () => { renders++; },
    );
    const file = { name: expectedImage ? 'image.png' : 'preuve.txt', type };
    const result = await upload([file], 'file-picker');
    assert.equal(requests.length, 1);
    assert.equal(requests[0].name, 'file');
    assert.equal(requests[0].file, file);
    assert.equal(pending.length, 1, 'successful upload must be displayed as staged');
    assert.equal(pending[0].name, file.name);
    assert.equal(pending[0].isImage, expectedImage);
    assert.equal(pending[0].id, 'file-proof');
    assert.equal(result.length, 1);
    assert.equal(renders, 1);
    assert.match(status.textContent, /(?:Pièce jointe prête|Photo reçue)/);
  }
});
test('Professor rejected upload cannot appear as a staged attachment', async () => {
  const html = await (await renderProfessor()).text();
  const start = html.indexOf('async function uploadChatFiles(');
  const end = html.indexOf('async function resumeLatestConversation()', start);
  const compile = new Function(
    'qs','fetch','FormData','localPhotoPreview','pendingChatFiles','renderPendingChatFiles',
    html.slice(start, end) + ';return uploadChatFiles;',
  );
  const pending = [];
  const status = { textContent: '' };
  const upload = compile(
    () => status, async () => ({ ok: false, json: async () => ({ code: 'FILE_TOO_LARGE' }) }),
    class { append() {} }, async () => null, pending, () => {},
  );
  const result = await upload([{ name: 'too-large.txt', type: 'text/plain' }]);
  assert.equal(pending.length, 0);
  assert.equal(result.length, 0);
  assert.match(status.textContent, /Échec du fichier.*FILE_TOO_LARGE/);
});
