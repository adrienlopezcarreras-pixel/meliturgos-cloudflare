import test from 'node:test';
import assert from 'node:assert/strict';
import { DEVELOPMENT_EXPERIENCE_PACK } from '../src/learning/development-experience-pack.js';
import { BOOTSTRAP_CORRECTIONS } from '../src/learning/bootstrap-corrections.js';
import { LearningEngine } from '../src/learning/learning-engine.js';

class MemoryStub {
  async recent() { return []; }
}

const IDS = [
  'bootstrap-divergent-candidate-targeted-promotion-20260927',
  'bootstrap-preserve-newer-main-hardening-20260927',
  'bootstrap-active-pr-branch-unicity-20260927',
  'bootstrap-deploy-success-vs-postproof-failure-20260927',
  'bootstrap-shardvault-explicit-pause-release-respect-20260927',
];

test('weekly validated development experience is canonical and deduplicated', () => {
  const packIds = DEVELOPMENT_EXPERIENCE_PACK.map(row => row.id);
  assert.equal(new Set(packIds).size, packIds.length);
  for (const id of IDS) {
    const row = DEVELOPMENT_EXPERIENCE_PACK.find(item => item.id === id);
    assert.ok(row, 'missing weekly XP '+id);
    assert.equal(row.validated, true);
    assert.equal(row.quality, 1);
    assert.ok(Array.isArray(row.tests) && row.tests.length > 0);
    assert.ok(BOOTSTRAP_CORRECTIONS.some(item => item.id === id));
  }
});

test('weekly experience reaches MEL LearningEngine training bundle', async () => {
  const engine = new LearningEngine({ memory: new MemoryStub() });
  const corrections = await engine.corrections({ limit: 500 });
  const bundle = await engine.trainingBundle({ minQuality: 0.95, limit: 500 });
  for (const id of IDS) {
    const lesson = DEVELOPMENT_EXPERIENCE_PACK.find(row => row.id === id);
    assert.ok(corrections.some(row => row.id === id), 'corrections missing '+id);
    const pair = bundle.preference.find(row => row.id === id);
    assert.ok(pair, 'training bundle missing '+id);
    assert.equal(pair.chosen, lesson.after);
    assert.equal(pair.rejected, lesson.before);
  }
});
