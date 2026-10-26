import test from 'node:test';
import assert from 'node:assert/strict';
import { localPcMediaCommand, parseLocalMediaStdout } from '../src/models/local-pc-media.js';

test('a media command never pastes the prompt into PowerShell', () => {
  const prompt = "'; calc.exe; \"bleu\"";
  const command = localPcMediaCommand({ kind: 'image', prompt }).command;
  assert.equal(command.includes(prompt), false);
  assert.match(command, /127\.0\.0\.1:7860\/sdapi\/v1\/txt2img/);
  assert.match(command, /System\.Speech/);
});

test('analyze sends the hash, not the picture', () => {
  const command = localPcMediaCommand({ kind: 'analyze', prompt: 'un cercle', sha256: 'ab'.repeat(32) }).command;
  assert.equal(command.includes('un cercle'), false);
  assert.match(command, /LOCAL_MEDIA_FILE_MISMATCH/);
  assert.match(command, /11434\/api\/chat/);
});

test('a local engine that is missing is an error, not a picture', () => {
  const missing = parseLocalMediaStdout('{"action":"local.media","kind":"image","code":"LOCAL_IMAGE_ENGINE_ABSENT"}');
  assert.equal(missing.ok, false);
  assert.equal(missing.code, 'LOCAL_IMAGE_ENGINE_ABSENT');
  const text = parseLocalMediaStdout(JSON.stringify({ action: 'local.media', kind: 'analyze', text_b64: btoa('cercle bleu') }));
  assert.equal(text.ok, true);
  assert.equal(text.text, 'cercle bleu');
});
