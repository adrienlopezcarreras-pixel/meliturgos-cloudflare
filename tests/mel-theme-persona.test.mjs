import test from 'node:test';
import assert from 'node:assert/strict';
import { MEL_THEME_IDS, resolveMelTheme, buildMelThemeInstruction, getMelThemeContract } from '../src/identity/mel-theme-persona.js';

test('theme persona contract exposes the same seven stable theme ids as the UI', () => {
  assert.deepEqual(MEL_THEME_IDS, ['classic','crusade','religious','granada','aviation','paladin','amazon']);
  for (const id of MEL_THEME_IDS) {
    assert.equal(resolveMelTheme(id), id);
    const contract = getMelThemeContract(id);
    assert.equal(contract.id, id);
    assert.ok(contract.instruction.length > 40);
  }
});

test('unknown or malformed themes fail safely to classic', () => {
  assert.equal(resolveMelTheme('unknown'), 'classic');
  assert.equal(resolveMelTheme(null), 'classic');
  assert.equal(resolveMelTheme(' PALADIN '), 'paladin');
});

test('new visual modes retain distinct backend persona instructions without changing factual behavior', () => {
  assert.match(buildMelThemeInstruction('granada'), /CATHÉDRALE DE GRENADE/);
  assert.match(buildMelThemeInstruction('aviation'), /AVIATION 1940s/);
  assert.match(buildMelThemeInstruction('aviation'), /jamais propagandiste/);
  assert.match(buildMelThemeInstruction('paladin'), /PALADIN LIGHT FULL PLATE/);
  assert.match(buildMelThemeInstruction('amazon'), /DIADÈME DU GRIFFON/);
  assert.match(buildMelThemeInstruction('amazon'), /ne change ni les faits ni tes règles/);
});
