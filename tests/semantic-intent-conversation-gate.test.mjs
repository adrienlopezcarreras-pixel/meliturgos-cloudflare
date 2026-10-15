import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldSemanticIntentCheck } from '../src/evolution/semantic-intent.js';

test('ordinary second-person assistance does not invoke MEL system router', () => {
  assert.equal(shouldSemanticIntentCheck('Peux-tu faire une recette de soupe ?'), false);
  assert.equal(shouldSemanticIntentCheck('Peux-tu modifier mon texte de présentation ?'), false);
});
test('specific system requests and contextual development followups remain routed', () => {
  assert.equal(shouldSemanticIntentCheck('Peux-tu modifier le code de MEL ?'), true);
  assert.equal(shouldSemanticIntentCheck('Continue', 'Nous corrigeons le code et la roadmap MEL'), true);
});
