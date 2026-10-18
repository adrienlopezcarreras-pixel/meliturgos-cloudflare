import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMelIdentityPrompt } from '../src/identity/mel-persona.js';





test('MEL persona permanently tutoyers Adrien and treats capability manifest as operational memory', () => {
  const prompt = buildMelIdentityPrompt();
  assert.match(prompt, /Adrien/);
  assert.match(prompt, /tutoies toujours/);
  assert.match(prompt, /CAPABILITY_MANIFEST/);
  assert.match(prompt, /mémoire opérationnelle/);
});
