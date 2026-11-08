import test from 'node:test';
import assert from 'node:assert/strict';
import { runCouncilReview } from '../src/evolution/council-review.js';

const approve = JSON.stringify({ verdict: 'APPROVE', blocking: [], summary: 'Implementation and executable regressions checked.' });
const diff = 'diff --git a/src/example.js b/src/example.js\n+export const ready = true;\n';

test('the real Council uses documented visible-answer settings for Gemma and Nemotron', async () => {
  const calls = [];
  const models = ['@cf/google/gemma-4-26b-a4b-it', '@cf/nvidia/nemotron-3-120b-a12b'];
  const env = { AI: { async run(model, params) {
    calls.push({ model, params });
    return { response: params.chat_template_kwargs?.enable_thinking === false ? approve : '' };
  } } };
  const result = await runCouncilReview(env, { diff, models });
  assert.equal(result.decision, 'APPROVED');
  assert.equal(result.reviews.length, 2);
  for (const { params } of calls) {
    assert.equal(params.neuron_reserve, true);
    assert.equal(params.max_tokens, 2400);
    assert.equal(params.messages[0].role, 'system');
    assert.equal(params.messages[1].role, 'user');
  }
});

for (const wrapped of [true, false]) test(`Council refuses ${wrapped ? 'wrapped' : 'raw'} Harmony analysis without a final verdict`, async () => {
  const trace = '<|channel|>analysis<|message|>' + approve + '<|end|>';
  const env = { AI: { async run(model) {
    if (model.includes('gpt-oss')) return wrapped ? { response: trace } : trace;
    return { response: approve };
  } } };
  const result = await runCouncilReview(env, { diff, models: ['@cf/openai/gpt-oss-120b', '@cf/meta/llama-3.3-70b-instruct-fp8-fast'] });
  assert.equal(result.decision, 'INSUFFICIENT_REVIEWERS');
  assert.equal(result.reviews.filter(r => r.verdict === 'APPROVE').length, 1);
});

test('a real final-channel rejection stays a rejection despite an earlier approval in analysis', async () => {
  const reject = JSON.stringify({ verdict: 'REJECT', blocking: ['Missing executable regression'], summary: 'Acceptance proof absent.' });
  const trace = '<|channel|>analysis<|message|>' + approve + '\n<|channel|>final<|message|>' + reject + '<|return|>';
  const result = await runCouncilReview({ AI: { async run() { return { response: trace }; } } },
    { diff, models: ['@cf/openai/gpt-oss-120b', '@cf/nvidia/nemotron-3-120b-a12b'] });
  assert.equal(result.decision, 'REJECTED');
  assert.ok(result.reviews.every(r => r.verdict === 'REJECT'));
});

test('a local substitute cannot be counted as an independent Workers AI review', async () => {
  const result = await runCouncilReview({ AI: { async run() {
    return { response: approve, local: true, provider: 'local-pc', model: 'pc:substitute' };
  } } }, { diff, models: ['@cf/google/gemma-4-26b-a4b-it', '@cf/nvidia/nemotron-3-120b-a12b'] });
  assert.equal(result.decision, 'INSUFFICIENT_REVIEWERS');
  assert.ok(result.reviews.every(review => review.verdict === null && review.error === 'COUNCIL_LOCAL_SUBSTITUTE_REFUSED'));
});

test('a fenced final JSON rejection preserves quoted channel markers as blocking evidence', async () => {
  const reject = JSON.stringify({ verdict: 'REJECT', blocking: ['Incorrect <|channel|>final handling'], summary: 'A genuine code objection.' });
  const result = await runCouncilReview({ AI: { async run() { return { response: '```json\n' + reject + '\n```' }; } } },
    { diff, models: ['@cf/google/gemma-4-26b-a4b-it', '@cf/nvidia/nemotron-3-120b-a12b'] });
  assert.equal(result.decision, 'REJECTED');
  assert.ok(result.reviews.every(review => review.blocking[0] === 'Incorrect <|channel|>final handling'));
});


test('the full sensitive Council can obtain three visible votes while unanswered seats remain unanswered', async () => {
  const models = ['@cf/google/gemma-4-26b-a4b-it', '@cf/nvidia/nemotron-3-120b-a12b',
    '@cf/openai/gpt-oss-120b', '@cf/meta/llama-3.3-70b-instruct-fp8-fast', '@cf/zai-org/glm-4.7-flash'];
  const calls = [];
  const env = { AI: { async run(model, params) {
    calls.push({ model, params });
    return { response: params.chat_template_kwargs?.enable_thinking === false ? approve : '' };
  } } };
  const sensitive = 'diff --git a/src/security/example.js b/src/security/example.js\n+export const ready = true;\n';
  const result = await runCouncilReview(env, { diff: sensitive, models });
  assert.equal(result.decision, 'APPROVED');
  assert.equal(result.reviews.filter(row => row.verdict === 'APPROVE').length, 3);
  assert.equal(result.reviews.filter(row => row.verdict === null).length, 2);
  assert.equal(calls.length, 5);
  assert.deepEqual(calls.find(row => row.model.includes('glm-4.7')).params.chat_template_kwargs, { enable_thinking: false });
  assert.ok(calls.every(row => row.params.max_tokens === 2400 && row.params.neuron_reserve === true));
});
