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
  assert.equal(normal.includes('id="objectivePanel"'), false);
  assert.equal(normal.includes('class="objective-panel"'), false);
  assert.equal(normal.includes('Objectif en cours'), false);
  assert.equal(normal.includes('src="/normal-runtime.js?v=10"'), true);
  assert.equal(NORMAL_RUNTIME_SOURCE.includes('maybeTrackObjective'), false);
  assert.equal(NORMAL_RUNTIME_SOURCE.includes('/api/chat/objective'), false);
  assert.equal((professor.match(/id="objectivePanel"/g) || []).length, 1);
  assert.equal(professor.includes('Objectif en cours'), true);
  assert.equal(professor.includes('id="objectiveAdd"'), true);
  assert.equal(professor.includes('id="objectiveAddSubmit"'), true);
  assert.equal(professor.includes("if(originalText&&source!=='code-auto'"), true);
  assert.equal(professor.includes('function maybeTrackObjective'), true);
  assert.equal(professor.includes('readObjective()'), true);
  assert.equal(OBJECTIVE_PANEL_SOURCE.includes('/api/chat/objective/step'), true);
  assert.equal(OBJECTIVE_PANEL_SOURCE.includes('const melQueueMessage=queueMessage'), false);
});


test('Professor objective floats independently with persisted layout and no Normal panel', () => {
  assert.match(OBJECTIVE_PANEL_SOURCE, /setupFloatingObjective\(\)/);
  assert.match(OBJECTIVE_PANEL_SOURCE, /document\.body\.appendChild\(objectivePanel\)/);
  assert.match(OBJECTIVE_PANEL_SOURCE, /setPointerCapture/);
  assert.match(OBJECTIVE_PANEL_SOURCE, /ResizeObserver/);
  assert.match(OBJECTIVE_PANEL_SOURCE, /localStorage\.setItem/);
  assert.match(OBJECTIVE_PANEL_SOURCE, /objective-collapsed/);
  assert.match(OBJECTIVE_PANEL_SOURCE, /mel-objective-show/);
  assert.doesNotMatch(NORMAL_RUNTIME_SOURCE, /setupFloatingObjective/);
});
