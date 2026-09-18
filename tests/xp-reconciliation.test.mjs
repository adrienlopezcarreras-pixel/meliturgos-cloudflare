import test from 'node:test';
import assert from 'node:assert/strict';
import { BOOTSTRAP_CORRECTIONS } from '../src/learning/bootstrap-corrections.js';
import { LearningEngine } from '../src/learning/learning-engine.js';
import { MEL_RUNTIME_OPERATING_EXPERIENCE } from '../src/learning/runtime-operating-experience.js';

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



test('runtime deployment XP is available to MEL without changing the LoRA corpus', () => {
  const id = 'bootstrap-detached-head-release-test-context-20260918';
  const row = MEL_RUNTIME_OPERATING_EXPERIENCE.find(item => item.id === id);
  assert.ok(row, 'runtime deployment XP missing');
  assert.equal(row.validated, true);
  assert.match(row.after, /SHA exact/);
  assert.match(row.after, /supprimer immédiatement le ref temporaire/);
  assert.equal(BOOTSTRAP_CORRECTIONS.some(item => item.id === id), false, 'runtime XP must not alter the LoRA training corpus');
  assert.equal(BOOTSTRAP_CORRECTIONS.length, 50);
});
