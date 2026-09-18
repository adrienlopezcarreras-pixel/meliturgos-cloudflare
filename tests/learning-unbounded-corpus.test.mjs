import test from 'node:test';
import assert from 'node:assert/strict';
import { LearningEngine } from '../src/learning/learning-engine.js';
import { MentorMemoryRepository } from '../src/learning/mentor-memory.js';
import { DEFAULT_LORA_BASE_MODEL } from '../src/learning/lora-plan.js';

test('MEL stores and trains on more than 2000 validated lessons without a lesson-count ceiling', async () => {
  const memory = new MentorMemoryRepository(null);
  const engine = new LearningEngine({ memory });
  const count = 2005;

  for (let i = 0; i < count; i += 1) {
    await engine.recordCorrection({
      id: `unbounded-${i}`,
      domain: 'continuous-learning',
      task: 'Keep accumulating validated lessons without a fixed lesson-count ceiling.',
      input: `lesson input ${i}`,
      before: `old behavior ${i}`,
      after: `learned behavior ${i}`,
      rationale: `validated rationale ${i}`,
      validated: true,
      quality: 0.9,
    });
  }

  const stored = await memory.all({ kind: 'TEACHER_CORRECTION' });
  assert.equal(stored.length, count, 'fallback memory must not truncate lessons at 2000');

  const corrections = await engine.corrections({ includeBootstrap: false });
  assert.equal(corrections.length, count, 'LearningEngine must read the full learned corpus, not only 500 recent lessons');

  const bundle = await engine.trainingBundle({ minQuality: 0.65 });
  assert.ok(bundle.accepted >= count, 'trainingBundle must include all validated learned lessons');

  const prepared = await engine.prepareLora({ base_model: DEFAULT_LORA_BASE_MODEL });
  assert.equal(prepared.plan.examples, bundle.accepted, 'LoRA preparation must use the complete current corpus');
  assert.equal(prepared.plan.readiness.min_examples, 50, '50 remains only the minimum readiness threshold');
  assert.ok(prepared.plan.examples > 2000, 'the corpus must be allowed to grow beyond 2000 lessons');
});
