import test from 'node:test';
import assert from 'node:assert/strict';
import { createLoraTrainingPlan, loraPolicy, MIN_LORA_VALIDATED_EXAMPLES } from '../src/learning/lora-plan.js';

test('LoRA becomes training-ready at the 50 validated-example threshold', () => {
  assert.equal(MIN_LORA_VALIDATED_EXAMPLES, 50);
  assert.equal(loraPolicy.minimum_validated_examples, 50);

  const below = createLoraTrainingPlan({ dataset_digest: 'dataset-49', examples: 49 });
  assert.equal(below.readiness.ready_for_training, false);
  assert.equal(below.readiness.enough_examples, false);
  assert.equal(below.readiness.min_examples, 50);
  assert.equal(below.status, 'DRAFT');

  const ready = createLoraTrainingPlan({ dataset_digest: 'dataset-50', examples: 50 });
  assert.equal(ready.readiness.ready_for_training, true);
  assert.equal(ready.readiness.enough_examples, true);
  assert.equal(ready.readiness.min_examples, 50);
  assert.equal(ready.status, 'READY_FOR_TRAINING');
  assert.equal(ready.readiness.benchmark_required_before_activation, true);
  assert.equal(ready.readiness.measured_gain_required, true);
});
