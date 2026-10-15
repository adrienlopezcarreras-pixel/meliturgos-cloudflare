import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorkersAIAdapter, inferenceOptions } from '../src/augmentio/workers-ai-adapter.js';

const councilPurposes = [
  'model-council-independent-critique',
  'model-council-synthesis',
];
const councilModels = [
  '@cf/google/gemma-4-26b-a4b-it',
  '@cf/nvidia/nemotron-3-120b-a12b',
];

for (const modelId of councilModels) {
  for (const purpose of councilPurposes) {
    test(`Council ${purpose} on ${modelId} disables optional thinking`, async () => {
      const calls = [];
      const env = { AI: {
        async run(model, payload) {
          calls.push({ model, payload });
          return { response: 'A real provider critique from the fixture' };
        },
      } };
      const adapter = createWorkersAIAdapter({ env, modelId });
      const result = await adapter.invoke({
        input: 'Assess a release gate',
        context: {
          purpose,
          inference_settings: { temperature: 0.2, max_tokens: 384 },
        },
      });
      assert.equal(result.text, 'A real provider critique from the fixture');
      assert.equal(calls.length, 1);
      assert.equal(calls[0].model, modelId);
      assert.deepEqual(calls[0].payload.chat_template_kwargs, { enable_thinking: false });
      assert.equal(calls[0].payload.max_tokens, 384);
      assert.equal(calls[0].payload.stream, undefined);
    });
  }
}

test('ordinary chat and models without documented switch remain unchanged', () => {
  for (const modelId of councilModels) {
    const opts = inferenceOptions({ purpose: 'ordinary-chat', inference_settings: { max_tokens: 100 } }, modelId);
    assert.equal(opts.chat_template_kwargs, undefined);
  }
  const llama = inferenceOptions({ purpose: councilPurposes[0], inference_settings: { max_tokens: 384 } }, '@cf/meta/llama-3.3-70b-instruct-fp8-fast');
  const glm = inferenceOptions({ purpose: councilPurposes[0] }, '@cf/zai-org/glm-4.7-flash');
  assert.equal(llama.chat_template_kwargs, undefined);
  assert.equal(glm.chat_template_kwargs, undefined);
});
test('nonreasoning mode never turns an empty provider response into an accepted critique', async () => {
  const env = { AI: { async run() { return { choices: [{ message: { content: '' } }] }; } } };
  const adapter = createWorkersAIAdapter({ env, modelId: councilModels[0] });
  await assert.rejects(
    () => adapter.invoke({ input: 'test', context: { purpose: councilPurposes[0] } }),
    e => e?.code === 'EMPTY_WORKERS_AI_RESPONSE',
  );
});
