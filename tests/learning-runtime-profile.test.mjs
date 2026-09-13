import test from 'node:test';
import assert from 'node:assert/strict';
import { applyLearnedRuntimeProfile } from '../src/learning/runtime-profile.js';

test('learned settings are defaults and explicit values win', () => {
  const result = applyLearnedRuntimeProfile({
    model: 'model-a',
    input: { prompt: 'hello', temperature: 0, max_tokens: 900 },
    profile: { settings: { temperature: 0.25, top_p: 0.8, max_tokens: 3072 } },
  });
  assert.equal(result.payload.temperature, 0);
  assert.equal(result.payload.top_p, 0.8);
  assert.equal(result.payload.max_tokens, 900);
});

test('adapter applies only to the exact base model', () => {
  const profile = { adapter: { base_model: 'model-a', adapter: { id: 'adapter-v1' } } };
  const match = applyLearnedRuntimeProfile({ model: 'model-a', input: { prompt: 'hello' }, profile });
  assert.equal(match.payload.lora, 'adapter-v1');
  assert.equal(match.applied.lora, true);
  const mismatch = applyLearnedRuntimeProfile({ model: 'model-b', input: { prompt: 'hello' }, profile });
  assert.equal(mismatch.payload.lora, undefined);
  assert.equal(mismatch.applied.lora, false);
});
