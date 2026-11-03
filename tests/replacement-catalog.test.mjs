import test from 'node:test';
import assert from 'node:assert/strict';
import { REPLACEMENT_CATALOG, replacementReadiness } from '../src/continuity/replacement-catalog.js';

test('all seven contingency bricks have candidate fallbacks and explicit live proof requirements', () => {
  assert.deepEqual(Object.keys(REPLACEMENT_CATALOG).sort(), ['cloudflare','github','gmail','model','onedrive','pc','shards'].sort());
  for (const [name, item] of Object.entries(REPLACEMENT_CATALOG)) {
    assert.ok(item.candidates.length, name);
    assert.ok(item.probes.length >= 3, name);
    const initial = replacementReadiness(name);
    assert.equal(initial.ready, false, name);
    assert.equal(initial.automatic_activation, false, name);
    const partial = Object.fromEntries(item.probes.slice(1).map(key => [key, true]));
    assert.equal(replacementReadiness(name, partial).ready, false, name);
    const complete = Object.fromEntries(item.probes.map(key => [key, true]));
    const evaluated = replacementReadiness(name, complete);
    assert.equal(evaluated.ready, true, name);
    assert.equal(evaluated.automatic_activation, false, name);
  }
});
