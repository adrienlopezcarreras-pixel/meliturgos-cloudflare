import test from 'node:test';
import assert from 'node:assert/strict';
import { inferAutonomyControlIntent, injectEvolutionPreflightCapability } from '../src/evolution/chat-intent.js';

test('autonomy status language maps to evidence-based status capability', () => {
  for (const text of [
    'où en es-tu de ton autonomie ?',
    'quel est le statut de ton auto-développement ?',
    'es-tu prête pour le self-development ?',
    'donne-moi l’avancement de la feuille de route',
  ]) {
    assert.deepEqual(inferAutonomyControlIntent(text), { id: 'autonomy.status', input: {} }, text);
  }
});

test('explicit continue-development language maps to one bounded autonomy tick', () => {
  for (const text of [
    'continue ton développement MEL',
    'avance sur ta feuille de route',
    'reprends le programme MEL',
    'poursuis ton autonomie',
  ]) {
    assert.deepEqual(inferAutonomyControlIntent(text), { id: 'autonomy.tick', input: {} }, text);
  }
});

test('generic continue does not trigger autonomous development without a clear autonomy domain', () => {
  for (const text of ['continue', 'avance', 'reprends', 'où en es-tu ?', 'travaille là-dessus']) {
    assert.equal(inferAutonomyControlIntent(text), null, text);
  }
});

test('specific capability development keeps evolution.enqueue priority over autonomy control', async () => {
  const request = new Request('https://mel/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text: 'développe une compétence qui suit l’autonomie', conversation_id: 'c1' }),
  });
  const injected = await injectEvolutionPreflightCapability(request);
  const body = await injected.json();
  assert.equal(body.capability.id, 'evolution.enqueue');
});

test('autonomy continue command is injected as autonomy.tick without creating a new dev job', async () => {
  const request = new Request('https://mel/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text: 'continue ton développement MEL' }),
  });
  const injected = await injectEvolutionPreflightCapability(request);
  const body = await injected.json();
  assert.deepEqual(body.capability, { id: 'autonomy.tick', input: {} });
});
