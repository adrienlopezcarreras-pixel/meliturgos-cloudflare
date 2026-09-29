import test from 'node:test';
import assert from 'node:assert/strict';
import { inferNativeSelfActivityCapability } from '../src/api/native-chat.js';

for (const prompt of [
  'tu as fait quoi pendant que tu étais en max actif ?',
  'qu’as-tu fait en autonomie ?',
  'quelle a été ton activité récente ?',
  'tu avances sur quoi dans la roadmap ?',
]) {
  test('routes self-activity question to live autonomy evidence: ' + prompt, () => {
    assert.deepEqual(inferNativeSelfActivityCapability(prompt), {
      id: 'autonomy.activity',
      input: { limit: 30 },
    });
  });
}

test('does not hijack unrelated personal-history questions', () => {
  assert.equal(inferNativeSelfActivityCapability('qu’est-ce que j’avais décidé pour le Ligier ?'), null);
});
