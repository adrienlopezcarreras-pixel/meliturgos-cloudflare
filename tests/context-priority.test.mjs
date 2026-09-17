import test from 'node:test';
import assert from 'node:assert/strict';

import { buildContext, buildCurrentTurnPriorityInstruction } from '../src/core/orchestrator/context-builder.js';
import { buildMelIdentityPrompt } from '../src/identity/mel-persona.js';

test('current MEL turn stays authoritative over irrelevant historical memory', () => {
  const current = 'on finit de mettre à jour ton architecture et ton code avant de te lancer dans des travaux';
  const retrieved = {
    prompt: '\n\n[MÉMOIRE] Adrien parle de ses enfants. Une ancienne mise à jour était terminée. [/MÉMOIRE]',
  };
  const messages = buildContext({
    system: buildMelIdentityPrompt(),
    retrieved,
    recent: [
      { role: 'assistant', content: 'Je vois ! Vous avez terminé la mise à jour et vos enfants...' },
    ],
    current,
  });

  assert.equal(messages.at(-1).role, 'user');
  assert.equal(messages.at(-1).content, current);

  const system = messages[0].content;
  const memoryIndex = system.indexOf('[MÉMOIRE]');
  const priorityIndex = system.indexOf('PRIORITÉ DU TOUR ACTUEL');
  assert.ok(memoryIndex >= 0);
  assert.ok(priorityIndex > memoryIndex, 'the current-turn guard must be appended after retrieved memory');
  assert.match(system, /dernier message utilisateur.*source autoritative/i);
  assert.match(system, /« on finit ».*travail est encore en cours/i);
  assert.match(system, /tutoiement est obligatoire/i);
});

test('MEL persona forbids formal address to Adrien and obsolete-memory overrides', () => {
  const prompt = buildMelIdentityPrompt();
  assert.match(prompt, /Adrien.*tutoies toujours/i);
  assert.match(prompt, /RÈGLE DE PRIORITÉ ABSOLUE/i);
  assert.match(prompt, /mémoire.*ne doivent jamais contredire/i);
  assert.match(prompt, /« on finit ».*travail encore en cours/i);
  assert.match(prompt, /N’introduis pas spontanément un sujet ancien/i);
});

test('priority instruction does not promote user text into the system role', () => {
  const guard = buildCurrentTurnPriorityInstruction();
  assert.doesNotMatch(guard, /on finit de mettre à jour ton architecture et ton code avant de te lancer dans des travaux/i);
  assert.match(guard, /dernier message utilisateur/i);
});
