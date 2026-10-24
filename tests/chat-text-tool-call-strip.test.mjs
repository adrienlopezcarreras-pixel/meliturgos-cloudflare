import test from 'node:test';
import assert from 'node:assert/strict';
import { stripTextToolCalls } from '../src/api/native-chat.js';

test('a tool call written as text never reaches the owner', () => {
  const leak = '{"name":"d1.query","arguments":{"database":"mel_tasks","sql":"SELECT id FROM t"}}';
  const out = stripTextToolCalls(leak);
  assert.doesNotMatch(out, /d1\.query|"arguments"/);
  assert.match(out, /pas pu exécuter l’outil/);
  assert.equal(stripTextToolCalls('Voici la réponse : {"tool":"x","arguments":{}} terminé.').includes('"tool"'), false);
});

test('ordinary answers, including JSON examples, are left untouched', () => {
  const answer = 'Le fichier contient {"a": 1} comme exemple.';
  assert.equal(stripTextToolCalls(answer), answer);
  assert.equal(stripTextToolCalls(''), '');
});
