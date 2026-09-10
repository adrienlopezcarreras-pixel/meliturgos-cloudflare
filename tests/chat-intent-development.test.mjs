import test from 'node:test';
import assert from 'node:assert/strict';
import { isEvolutionDevelopmentIntent, injectEvolutionPreflightCapability } from '../src/evolution/chat-intent.js';

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

test('ordinary non-development conversation does not enqueue code work', () => {
  const negatives = [
    'Bonjour MEL',
    'Explique-moi le Moyen Âge',
    'Quel temps fait-il ?',
    'Que sais-tu faire ?',
  ];
  for (const text of negatives) assert.equal(isEvolutionDevelopmentIntent(text), false, text);
});

test('chat injector turns an interface edit order into evolution.enqueue', async () => {
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
