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




test('canonical deployment XP grows the MEL corpus without changing the LoRA threshold', async () => {
  const id = 'bootstrap-detached-head-release-test-context-20260918';
  const row = BOOTSTRAP_CORRECTIONS.find(item => item.id === id);
  assert.ok(row, 'canonical deployment XP missing');
  assert.equal(row.validated, true);
  assert.equal(row.quality, 1);
  assert.match(row.after, /SHA exact/);
  assert.match(row.after, /supprimer le ref temporaire/);

  const engine = new LearningEngine({ memory: new MemoryStub() });
  const bundle = await engine.trainingBundle({ minQuality: 0.65, limit: 500 });
  assert.equal(bundle.preference.some(item => item.id === id), true, 'deployment XP absent from trainingBundle');
  assert.ok(bundle.accepted >= 51, 'MEL corpus should be allowed to grow beyond 50 lessons');
});


test('ShardVault proven-active XP is loaded by MEL training', async () => {
  const id = 'shardvault-proven-active-source-of-truth-20260919';
  const row = BOOTSTRAP_CORRECTIONS.find(item => item.id === id);
  assert.ok(row, 'ShardVault source-of-truth XP missing');
  assert.equal(row.validated, true);
  assert.equal(row.quality, 1);
  assert.match(row.after, /QUALIFIÉ, STAGED et ACTIF/);
  assert.match(row.after, /même source de vérité backend/);

  const engine = new LearningEngine({ memory: new MemoryStub() });
  const corrections = await engine.corrections({ limit: 500 });
  const bundle = await engine.trainingBundle({ minQuality: 0.65, limit: 500 });
  assert.equal(corrections.some(item => item.id === id && item.validated === true), true, 'XP absent from MEL corrections');
  assert.equal(bundle.preference.some(item => item.id === id), true, 'XP absent from MEL trainingBundle');
});
