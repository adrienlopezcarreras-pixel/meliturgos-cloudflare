import test from 'node:test';
import assert from 'node:assert/strict';
import { REPLACEMENT_CATALOG, replacementReadiness, verifiedReplacementReadiness } from '../src/continuity/replacement-catalog.js';

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

test('replacement readiness requires fresh candidate-specific proof and never authorizes activation', () => {
  const now = Date.parse('2026-11-03T20:00:00.000Z');
  const part = 'shards';
  const candidate = 'ipfs-encrypted-pins';
  const probes = REPLACEMENT_CATALOG[part].probes;
  const observations = probes.map((probe, index) => ({
    part, candidate, probe, passed: true, observer: 'independent-test-runner',
    evidence_id: 'probe-' + index, observed_at: '2026-11-03T19:59:00.000Z',
  }));
  assert.equal(verifiedReplacementReadiness(part, candidate, observations, { now }).ready, true);
  assert.equal(verifiedReplacementReadiness(part, candidate, observations, { now }).activation_allowed, false);
  assert.equal(verifiedReplacementReadiness(part, candidate, observations.slice(1), { now }).ready, false);
  assert.equal(verifiedReplacementReadiness(part, candidate, observations, { now: now + 86400000 }).ready, false);
  assert.equal(verifiedReplacementReadiness(part, 'unknown-host', observations, { now }).ready, false);
  assert.equal(verifiedReplacementReadiness(part, candidate, observations.map(row => ({...row, observer: ''})), { now }).ready, false);
});
