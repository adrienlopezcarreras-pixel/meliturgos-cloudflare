import test from 'node:test';
import assert from 'node:assert/strict';
import { isSelfCapabilityQuestion } from '../src/api/native-chat.js';

test('questions about what MEL can do leave the plain chat path for the runtime manifest', () => {
  for (const q of ['Qu’est-ce que tu sais faire ?', 'que sais-tu faire', 'tu sais faire quoi', 'Quels outils as-tu ?', 'quels sont tes outils', 'liste tes capacités', 'Tu peux générer une image ?', 'peux-tu lire tes fichiers source']) {
    assert.equal(isSelfCapabilityQuestion(q), true, q);
  }
  for (const q of ['salut ça va ?', 'raconte une blague', 'fais une image d’un chat']) {
    assert.equal(isSelfCapabilityQuestion(q), false, q);
  }
});
