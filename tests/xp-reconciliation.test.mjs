import test from 'node:test';
import assert from 'node:assert/strict';
import { BOOTSTRAP_CORRECTIONS } from '../src/learning/bootstrap-corrections.js';
import { LearningEngine } from '../src/learning/learning-engine.js';

class MemoryStub {
  async remember(row) { return structuredClone(row); }
  async recent() { return []; }
}

const RECONCILED_IDS = [
  'bootstrap-sensitive-context-intent-20260917',
  'bootstrap-learning-operator-truthfulness-20260917',
  'bootstrap-dev-bridge-auth-scope-20260917',
  'bootstrap-zero-euro-runtime-readiness-20260917',
];

test('all reconciled MEL XP are part of the canonical bootstrap corpus', () => {
  const ids = new Set(BOOTSTRAP_CORRECTIONS.map(row => row.id));
  for (const id of RECONCILED_IDS) assert.equal(ids.has(id), true, `missing bootstrap XP: ${id}`);
  assert.equal(BOOTSTRAP_CORRECTIONS.length >= 30, true);
});

test('LearningEngine exposes every reconciled XP as a validated correction', async () => {
  const engine = new LearningEngine({ memory: new MemoryStub() });
  const corrections = await engine.corrections({ limit: 500 });
  const byId = new Map(corrections.map(row => [row.id, row]));
  for (const id of RECONCILED_IDS) {
    assert.equal(byId.get(id)?.validated, true, `MEL cannot read validated XP: ${id}`);
    assert.ok(Number(byId.get(id)?.quality) >= 0.65, `XP quality too low for training: ${id}`);
  }
});

test('reconciled XP are actually accepted into MEL trainingBundle', async () => {
  const engine = new LearningEngine({ memory: new MemoryStub() });
  const bundle = await engine.trainingBundle({ minQuality: 0.65, limit: 500 });
  const preferenceIds = new Set(bundle.preference.map(row => row.id));
  for (const id of RECONCILED_IDS) assert.equal(preferenceIds.has(id), true, `XP absent from trainingBundle: ${id}`);
  assert.ok(bundle.accepted >= 30);
});


test('deployment detached-HEAD XP is loaded and accepted by MEL', async () => {
  const id = 'bootstrap-detached-head-release-test-context-20260918';
  const bootstrap = new Map(BOOTSTRAP_CORRECTIONS.map(row => [row.id, row]));
  assert.equal(bootstrap.get(id)?.validated, true);
  assert.ok(Number(bootstrap.get(id)?.quality) >= 0.65);

  const engine = new LearningEngine({ memory: new MemoryStub() });
  const corrections = await engine.corrections({ limit: 500 });
  const correction = corrections.find(row => row.id === id);
  assert.equal(correction?.validated, true, 'MEL cannot read the deployment XP');

  const bundle = await engine.trainingBundle({ minQuality: 0.65, limit: 500 });
  const preferenceIds = new Set(bundle.preference.map(row => row.id));
  assert.equal(preferenceIds.has(id), true, 'deployment XP absent from trainingBundle');
});
