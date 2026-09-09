import test from 'node:test';
import assert from 'node:assert/strict';
import handleAugmentio from '../src/api/augmentio-api.js';

test('augmentio API fans out across registered Workers AI models and prepares teacher review', async () => {
  const calledModels = [];
  const env = {
    AI: {
      async run(model, payload) {
        calledModels.push(model);
        assert.ok(Array.isArray(payload.messages));
        return { response: `answer from ${model}` };
      },
    },
  };

  const request = new Request('https://mel.test/api/gen2/augmentio/fanout', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ input: 'Compare these approaches', capability: 'GENERAL', maxCandidates: 2, teacherReview: true }),
  });

  const response = await handleAugmentio(request, env);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.mode, 'augmentio');
  assert.equal(body.candidates.length, 2);
  assert.equal(calledModels.length, 2);
  assert.equal(body.teacherRequest.subtype, 'MULTI_AI_REVIEW');
  assert.equal(body.teacherRequest.candidates.length, 2);
});

test('augmentio API rejects missing input', async () => {
  const request = new Request('https://mel.test/api/gen2/augmentio/fanout', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}',
  });
  const response = await handleAugmentio(request, { AI: { run: async () => ({ response: 'x' }) } });
  assert.equal(response.status, 400);
});
