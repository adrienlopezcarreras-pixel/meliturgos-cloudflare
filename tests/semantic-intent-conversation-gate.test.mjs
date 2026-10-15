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

test('date words alone do not force web research intent', () => {
  assert.equal(shouldSemanticIntentCheck("Aujourd'hui je suis fatigué"), false);
  assert.equal(shouldSemanticIntentCheck("Today I feel better"), false);
  assert.equal(shouldSemanticIntentCheck("Vérifie les actualités sur le web aujourd'hui"), true);
});

test('recent and latest adjectives alone are not public-web requests', () => {
  assert.equal(shouldSemanticIntentCheck('Voici mes dernières idées'), false);
  assert.equal(shouldSemanticIntentCheck('Mon dernier roman'), false);
  assert.equal(shouldSemanticIntentCheck('Recherche les dernières actualités sur Internet'), true);
});
