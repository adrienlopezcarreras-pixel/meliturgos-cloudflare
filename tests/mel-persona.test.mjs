import assert from 'node:assert/strict';
import test from 'node:test';
import { MEL_IDENTITY, buildMelIdentityPrompt } from '../src/identity/mel-persona.js';

test('MEL keeps a stable feminine identity', () => {
  assert.equal(MEL_IDENTITY.name, 'MEL');
  assert.equal(MEL_IDENTITY.persona, 'feminine');
  const prompt = buildMelIdentityPrompt();
  assert.match(prompt, /Tu es MEL/);
  assert.match(prompt, /persona est féminine/);
  assert.match(prompt, /parles de toi au féminin/);
  assert.match(prompt, /pas une humaine/);
});
