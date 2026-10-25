import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('the watch page approves every proposed option in one click', () => {
  const page = readFileSync('src/pages/watch-interface.js', 'utf8');
  assert.match(page, /id="approveAll"[^>]*>Tout approuver<\/button>/);
  assert.match(page, /action:'APPROVE'/);
  assert.doesNotMatch(readFileSync('src/pages/full-interface-v2.js', 'utf8'), /melFullLaunchAll/);
});

test('the LoRA page opens with a plain-language summary', () => {
  const page = readFileSync('src/pages/full-interface-v2.js', 'utf8');
  assert.match(page, /id="freeLoraPlain"/);
  assert.match(page, /Rien à faire de votre côté : tout est gratuit et automatique\./);
});
