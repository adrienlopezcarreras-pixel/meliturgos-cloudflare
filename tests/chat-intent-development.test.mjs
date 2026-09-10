import test from 'node:test';
import assert from 'node:assert/strict';
import { isEvolutionDevelopmentIntent, injectEvolutionPreflightCapability } from '../src/evolution/chat-intent.js';
import { shouldSemanticIntentCheck, classifySemanticOwnerIntent } from '../src/evolution/semantic-intent.js';
import { setDefaultCapabilityEnvironment } from '../src/capabilities/default-bus.js';

test('interface modification commands are recognized as real development intent', () => {
  const positives = [
    'Modifie immédiatement l’interface active',
    'Supprime le bouton Compétences',
    'Change le thème médiéval',
    'Ajoute des éléments de décor dans le CSS',
    'Corrige le chat pour qu’il lance le Dev Bridge',
    'Enlève ce panneau et remplace l’avatar',
    'Mets à jour la page et les tests',
  ];
  for (const text of positives) assert.equal(isEvolutionDevelopmentIntent(text), true, text);
});

test('ordinary non-development conversation is not mistaken for direct code work', () => {
  const negatives = [
    'Bonjour MEL',
    'Explique-moi le Moyen Âge',
    'Quel temps fait-il ?',
    'Que sais-tu faire ?',
  ];
  for (const text of negatives) assert.equal(isEvolutionDevelopmentIntent(text), false, text);
});

test('chat injector turns an explicit interface edit order into evolution.enqueue', async () => {
  const request = new Request('https://mel.example/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      text: 'Modifie l’interface et supprime le bouton Compétences',
      conversation_id: 'conv-1',
      client_message_id: 'msg-1',
    }),
  });
  const prepared = await injectEvolutionPreflightCapability(request);
  const body = await prepared.json();
  assert.equal(body.capability?.id, 'evolution.enqueue');
  assert.equal(body.capability?.input?.conversationId, 'conv-1');
  assert.equal(body.capability?.input?.requestKey, 'msg-1');
  assert.match(body.capability?.input?.goal || '', /Modifie l.interface/i);
});

test('semantic gate recognizes elliptical formulations when recent context is MEL development', () => {
  const context = 'USER: Je veux modifier l’interface de MEL et son thème médiéval.\nMEL: Nous pouvons rendre le cadre plus riche.';
  for (const text of ['fais-le', 'oui', 'plus doré', 'comme ça mais moins sombre', 'je préfère sans ce bouton']) {
    assert.equal(shouldSemanticIntentCheck(text, context), true, text);
  }
  assert.equal(shouldSemanticIntentCheck('Bonjour', ''), false);
});

test('semantic classifier uses FAST model and resolves a vague follow-up into a self-contained development goal', async () => {
  const calls = [];
  setDefaultCapabilityEnvironment({
    AI: {
      async run(model, input) {
        calls.push({ model, input });
        return { response: JSON.stringify({
          intent: 'DEVELOPMENT_REQUEST',
          resolved_goal: 'Modifier le thème médiéval de MEL pour ajouter davantage de dorures sans changer la lisibilité.',
          confidence: 0.97,
        }) };
      }
    }
  });
  const result = await classifySemanticOwnerIntent({
    text: 'plus doré',
    context: 'USER: Modifie le thème médiéval de l’interface de MEL.\nMEL: Le cadre peut être enrichi.',
  });
  assert.equal(result?.intent, 'DEVELOPMENT_REQUEST');
  assert.match(result?.resolvedGoal || '', /dorures/i);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].model, '@cf/zai-org/glm-4.7-flash');
});

test('chat injector semantically routes a contextual formulation instead of answering as generic chat', async () => {
  setDefaultCapabilityEnvironment({
    AI: {
      async run() {
        return { response: JSON.stringify({
          intent: 'DEVELOPMENT_REQUEST',
          resolved_goal: 'Supprimer le bouton Compétences de l’interface active de MEL.',
          confidence: 0.99,
        }) };
      }
    }
  });
  const request = new Request('https://mel.example/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      text: 'fais-le',
      intent_context: 'USER: Enlève le bouton Compétences de l’interface de MEL.\nMEL: Je peux te donner les étapes.',
      conversation_id: 'conv-2',
      client_message_id: 'msg-2',
    }),
  });
  const prepared = await injectEvolutionPreflightCapability(request);
  const body = await prepared.json();
  assert.equal(body.capability?.id, 'evolution.enqueue');
  assert.equal(body.intent_routing?.mode, 'semantic');
  assert.match(body.capability?.input?.goal || '', /Supprimer le bouton Compétences/i);
});
