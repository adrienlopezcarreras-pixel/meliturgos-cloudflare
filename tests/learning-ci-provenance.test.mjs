import test from 'node:test';
import assert from 'node:assert/strict';
import { BOOTSTRAP_CORRECTIONS } from '../src/learning/bootstrap-corrections.js';
import { LearningEngine } from '../src/learning/learning-engine.js';

class MemoryStub {
  async recent() { return []; }
}

test('CI provenance-before-fix lesson is durable and available to MEL training', async () => {
  const lesson = BOOTSTRAP_CORRECTIONS.find(row => row.id === 'bootstrap-ci-provenance-before-fix-20260916');
  assert.ok(lesson);
  assert.equal(lesson.validated, true);
  assert.equal(lesson.quality, 1);
  assert.ok(lesson.tags.includes('provenance'));
  assert.ok(lesson.tags.includes('deduplication'));
  assert.match(lesson.after, /parent du lot|précédent HEAD candidat/);
  assert.match(lesson.after, /ne pas dupliquer le patch/);
  assert.match(lesson.after, /SHA exact/);

  const engine = new LearningEngine({ memory: new MemoryStub() });
  const corrections = await engine.corrections({ limit: 500 });
  assert.ok(corrections.some(row => row.id === lesson.id));

  const bundle = await engine.trainingBundle({ minQuality: 0.95, limit: 500 });
  const pair = bundle.preference.find(row => row.id === lesson.id);
  assert.ok(pair);
  assert.equal(pair.chosen, lesson.after);
  assert.equal(pair.rejected, lesson.before);
});
