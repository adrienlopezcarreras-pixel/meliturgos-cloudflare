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

test('chat development request receives evolution.preflight capability before routing', async () => {
  const request = new Request('https://mel.test/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Basic x' },
    body: JSON.stringify({ text: 'Développe une compétence agenda', conversation_id: 'c1' })
  });
  const prepared = await injectEvolutionPreflightCapability(request);
  const body = await prepared.json();
  assert.equal(body.capability.id, 'evolution.preflight');
  assert.equal(body.capability.input.minResponses, 2);
  assert.equal(body.capability.input.context.rule, 'AI_COUNCIL_BEFORE_CODE');
  assert.match(body.capability.input.goal, /agenda/);
  assert.equal(body.conversation_id, 'c1');
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
