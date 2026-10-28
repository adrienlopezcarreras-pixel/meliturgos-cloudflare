import test from 'node:test';
import assert from 'node:assert/strict';
import { applyObjectiveStep, objectiveFromMessage, stepsForObjective } from '../../src/chat/objective-plan.js';
import { handleChatObjective } from '../../src/api/chat-objective-api.js';
import { sqliteD1 } from '../helpers/sqlite-d1.mjs';
import { onRequestGet } from '../../src/pages/mvp-interface-v3.js';
import { onRequestGet as onProfessorGet } from '../../src/pages/full-interface-v2.js';
import { OBJECTIVE_PANEL_SOURCE } from '../../src/pages/objective-panel-runtime.js';
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

test('objective panel exists only in Professor chat, never in Normal', async () => {
  const normal = await (await onRequestGet()).text();
  const professor = await (await onProfessorGet()).text();
  assert.doesNotMatch(normal, /id="objectivePanel"/);
  assert.doesNotMatch(normal, /class="objective-panel"/);
  assert.doesNotMatch(normal, /Objectif en cours/);
  assert.match(normal, /src="\\/normal-runtime\\.js\\?v=10"/);
  assert.doesNotMatch(NORMAL_RUNTIME_SOURCE, /maybeTrackObjective|OBJECTIVE_PANEL_SOURCE|\\/api\\/chat\\/objective/);
  assert.equal((professor.match(/id="objectivePanel"/g) || []).length, 1);
  assert.match(professor, /Objectif en cours/);
  assert.match(professor, /id="objectiveAdd"/);
  assert.match(professor, /if\\(originalText&&source!==/);
  assert.match(professor, /function maybeTrackObjective/);
  assert.match(professor, /readObjective\\(\\)/);
  assert.match(OBJECTIVE_PANEL_SOURCE, /\\/api\\/chat\\/objective\\/step/);
  assert.doesNotMatch(OBJECTIVE_PANEL_SOURCE, /const melQueueMessage=queueMessage/);
});
