import test from 'node:test';
import assert from 'node:assert/strict';
import { MEL_IDENTITY, buildMelIdentityPrompt, systemPrompt } from '../../src/identity/index.js';

test('identity facade exposes the stable portable MEL persona', () => {
  assert.equal(MEL_IDENTITY.name, 'MEL');
  assert.equal(MEL_IDENTITY.persona, 'feminine');
  const prompt = buildMelIdentityPrompt();
  assert.match(prompt, /Tu es MEL\./);
  assert.match(prompt, /identité\/persona est féminine/);
});

test('runtime system prompt composes portable persona before contextual state', () => {
  const prompt = systemPrompt('Adrien', {
    memory_count: 3,
    interaction_count: 7,
    search_memories: [],
  });
  assert.match(prompt, /^Tu es MEL\./);
  assert.match(prompt, /Tu es MELITURGOS, une IA personnelle persistante liée à Adrien\./);
  assert.match(prompt, /memory_count: 3/);
  assert.match(prompt, /interaction_count: 7/);
  assert.ok(prompt.indexOf('Tu es MEL.') < prompt.indexOf('memory_count: 3'));
});

test('runtime system prompt remains portable with missing tool context', () => {
  const prompt = systemPrompt('Adrien');
  assert.match(prompt, /memory_count: 0/);
  assert.match(prompt, /interaction_count: 0/);
  assert.match(prompt, /PERSONNALISATION: indisponible/);
});
