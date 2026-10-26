import test from 'node:test';
import assert from 'node:assert/strict';
import { applyObjectiveStep, objectiveFromMessage, stepsForObjective } from '../../src/chat/objective-plan.js';
import { handleChatObjective } from '../../src/api/chat-objective-api.js';
import { sqliteD1 } from '../helpers/sqlite-d1.mjs';
import { onRequestGet } from '../../src/pages/mvp-interface-v3.js';
import { NORMAL_RUNTIME_SOURCE } from '../../src/pages/mvp-runtime.js';

test('a chat objective becomes a short followable list', () => {
  assert.equal(objectiveFromMessage('bonjour'), '');
  assert.equal(objectiveFromMessage('ok mel fais un pdf du plan'), 'fais un pdf du plan');
  assert.equal(objectiveFromMessage('objectif: relire le livre puis écrire le résumé'), 'relire le livre puis écrire le résumé');
  const steps = stepsForObjective('cadrer le magazine ; produire le PDF ; vérifier le lien');
  assert.equal(steps.length, 3);
  assert.equal(steps[0].state, 'doing');
  assert.equal(steps[1].state, 'todo');
  const added = applyObjectiveStep(steps, { label: 'montrer le fichier' });
  assert.equal(added.length, 4);
  const done = applyObjectiveStep(added, { stepId: 's1', state: 'done' });
  assert.equal(done[0].state, 'done');
  const doing = applyObjectiveStep(done, { stepId: 's2', state: 'doing' });
  assert.equal(doing.filter(step => step.state === 'doing').length, 1);
  assert.equal(doing[1].id, 's2');
});

test('the active objective is stored, replaced and stepped', async () => {
  const env = { DB: sqliteD1(), MELITURGOS_USER: 'adrien' };
  const created = await handleChatObjective(new Request('https://mel.test/api/chat/objective', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text: 'fais le classeur ; vérifie qu’il s’ouvre' }),
  }), env);
  const plan = (await created.json()).plan;
  assert.equal(created.status, 200);
  assert.equal(plan.steps.length, 2);
  assert.equal(plan.steps[0].state, 'doing');

  const moved = await handleChatObjective(new Request('https://mel.test/api/chat/objective/step', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ step_id: plan.steps[0].id, state: 'done' }),
  }), env);
  assert.equal((await moved.json()).plan.steps[0].state, 'done');

  const added = await handleChatObjective(new Request('https://mel.test/api/chat/objective/step', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ label: 'montrer le lien' }),
  }), env);
  assert.equal((await added.json()).plan.steps.length, 3);

  const replaced = await handleChatObjective(new Request('https://mel.test/api/chat/objective', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text: 'objectif: construire le vectoriel' }),
  }), env);
  const next = (await replaced.json()).plan;
  assert.match(next.title, /vectoriel/);
  const current = await handleChatObjective(new Request('https://mel.test/api/chat/objective'), env);
  assert.equal((await current.json()).plan.id, next.id);
});

test('the chat page keeps one fixed objective panel', async () => {
  const html = await (await onRequestGet()).text();
  assert.equal((html.match(/id="objectivePanel"/g) || []).length, 1);
  assert.match(html, /src="\/normal-runtime\.js\?v=10"/);
  assert.match(NORMAL_RUNTIME_SOURCE, /maybeTrackObjective/);
  assert.match(NORMAL_RUNTIME_SOURCE, /function queueMessage/);
  assert.ok(NORMAL_RUNTIME_SOURCE.indexOf('function queueMessage') < NORMAL_RUNTIME_SOURCE.indexOf('maybeTrackObjective'));
});
