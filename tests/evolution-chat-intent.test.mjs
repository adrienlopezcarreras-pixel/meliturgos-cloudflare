import test from 'node:test';
import assert from 'node:assert/strict';
import { isEvolutionDevelopmentIntent, injectEvolutionPreflightCapability } from '../src/evolution/chat-intent.js';

test('detects skill/module development requests without catching ordinary writing', () => {
  assert.equal(isEvolutionDevelopmentIntent('Développe une compétence pour gérer mon agenda'), true);
  assert.equal(isEvolutionDevelopmentIntent('Ajoute un module calendrier'), true);
  assert.equal(isEvolutionDevelopmentIntent('Build a connector for my calendar'), true);
  assert.equal(isEvolutionDevelopmentIntent('Crée-moi un texte pour le site'), false);
  assert.equal(isEvolutionDevelopmentIntent('Quelle est la météo ?'), false);
});

test('chat development request receives persistent evolution.enqueue capability before routing', async () => {
  const request = new Request('https://mel.test/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Basic x' },
    body: JSON.stringify({
      text: 'Développe une compétence agenda',
      conversation_id: 'c1',
      client_message_id: 'm1',
    })
  });
  const prepared = await injectEvolutionPreflightCapability(request);
  const body = await prepared.json();
  assert.equal(body.capability.id, 'evolution.enqueue');
  assert.match(body.capability.input.goal, /agenda/);
  assert.equal(body.capability.input.conversationId, 'c1');
  assert.equal(body.capability.input.requestKey, 'm1');
  assert.equal('minResponses' in body.capability.input, false);
  assert.equal('context' in body.capability.input, false);
  assert.equal(body.conversation_id, 'c1');
});

test('chat enqueue accepts legacy requests without a client message id and remains bounded', async () => {
  const request = new Request('https://mel.test/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text: 'Ajoute un module calendrier', conversation_id: 'c2' })
  });
  const prepared = await injectEvolutionPreflightCapability(request);
  const body = await prepared.json();
  assert.equal(body.capability.id, 'evolution.enqueue');
  assert.equal(body.capability.input.conversationId, 'c2');
  assert.equal(body.capability.input.requestKey, '');
});

test('explicit capability is never overwritten', async () => {
  const request = new Request('https://mel.test/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text: 'Développe une compétence agenda', capability: { id: 'echo', input: { value: 'x' } } })
  });
  const prepared = await injectEvolutionPreflightCapability(request);
  const body = await prepared.json();
  assert.equal(body.capability.id, 'echo');
});
