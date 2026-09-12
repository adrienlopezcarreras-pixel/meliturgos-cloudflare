import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequestGet } from '../src/pages/mvp-interface-v2.js';
import { finalizeMvpInterface } from '../src/pages/mvp-interface-finalizer.js';
import { MVP_BEHAVIOR_PATCH } from '../src/pages/mvp-behavior-enhancer.js';

function count(source, pattern) {
  return (source.match(pattern) || []).length;
}

test('normal mode exposes one useful control for each core action', async () => {
  const enhanced = await onRequestGet({});
  const final = await finalizeMvpInterface(enhanced);
  const html = await final.text();

  assert.equal(count(html, /id="send"/g), 1, 'one send button');
  assert.equal(count(html, /id="full"/g), 1, 'one full-mode button');
  assert.equal(count(html, /id="themeButton"/g), 1, 'one theme launcher');
  assert.equal(count(html, /id="avatar"/g), 1, 'one MEL voice avatar');
  assert.equal(count(html, /id="drop"/g), 1, 'one attachment drop zone');
  assert.equal(count(html, /id="fileInput"/g), 1, 'one attachment picker');
  assert.equal(count(html, /id="messages"/g), 1, 'one conversation surface');
  assert.equal(count(html, /id="input"/g), 1, 'one composer');
  assert.equal(count(html, /data-theme-choice=/g), 7, 'seven intentional visual themes');

  assert.match(html, /Lectures du jour/);
  assert.match(html, /Audit MEL/);
  assert.match(html, /Continuer depuis la dernière phrase/);
  assert.match(html, /Mode complet/);
});

test('normal mode attachments are useful without silently invoking remote AI', () => {
  assert.match(MVP_BEHAVIOR_PATCH, /installSafeFiles/);
  assert.match(MVP_BEHAVIOR_PATCH, /file\.text\(\)/);
  assert.match(MVP_BEHAVIOR_PATCH, /lecture locale zéro-euro/);
  assert.match(MVP_BEHAVIOR_PATCH, /analyse distante bloquée/);
  assert.doesNotMatch(MVP_BEHAVIOR_PATCH, /\/api\/files\/analyze/);
  assert.doesNotMatch(MVP_BEHAVIOR_PATCH, /\/api\/files\/upload/);
  assert.doesNotMatch(MVP_BEHAVIOR_PATCH, /\.drop,#fileInput,.mel-file-tray\{display:none/);
});

test('normal mode preserves explicit user action before sending attached file content', () => {
  assert.match(MVP_BEHAVIOR_PATCH, /ajoute ta consigne puis clique sur Envoyer/);
  assert.match(MVP_BEHAVIOR_PATCH, /input\.value=\(input\.value\+block/);
  assert.doesNotMatch(MVP_BEHAVIOR_PATCH, /queueMessage\([^)]*block/);
});
