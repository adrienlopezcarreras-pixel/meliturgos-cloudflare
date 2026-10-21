import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseVerdict, decide, runCouncilReview, orderCouncilModels, freeCouncilCatalog } from '../src/evolution/council-review.js';

test('council verdicts and majority rule', async () => {
  assert.equal(parseVerdict('x {"verdict":"approve"} y').verdict, 'APPROVE');
  const A = { verdict: 'APPROVE' }, R = { verdict: 'REJECT' }, N = { verdict: null };
  assert.equal(decide([A, A, R, N]), 'INSUFFICIENT_REVIEWERS');
  assert.equal(decide([A, R, R, A]), 'REJECTED');
  assert.equal(decide([A, N, N, N]), 'INSUFFICIENT_REVIEWERS');
  assert.equal(decide([
    { model: '@cf/openai/gpt-oss-120b', verdict: 'APPROVE' },
    { model: '@cf/meta/llama-3.3-70b-instruct-fp8-fast', verdict: 'APPROVE' },
    { model: '@cf/nvidia/nemotron-3-120b-a12b', verdict: null, error: 'REVIEW_TIMEOUT' },
    { model: '@cf/google/gemma-4-26b-a4b-it', verdict: null, error: 'EMPTY' },
  ]), 'INSUFFICIENT_REVIEWERS');
  assert.equal(decide([
    { model: 'a', verdict: 'APPROVE', summary: 'correct et testé' },
    { model: 'b', verdict: 'APPROVE', summary: 'pas de garde-fou retiré' },
    { model: 'c', verdict: 'APPROVE', summary: 'le changement est branché' },
    { model: 'd', verdict: null, error: 'REVIEW_TIMEOUT' },
  ]), 'APPROVED');
  assert.equal(decide([
    { model: '@cf/openai/gpt-oss-120b', verdict: 'APPROVE' },
    { model: '@cf/openai/gpt-oss-120b', verdict: 'APPROVE' },
  ]), 'INSUFFICIENT_REVIEWERS');
  assert.equal(decide([
    { model: '@cf/openai/gpt-oss-120b', verdict: 'APPROVE' },
    { model: '@cf/meta/llama-3.3-70b-instruct-fp8-fast', verdict: 'APPROVE' },
  ]), 'APPROVED');
  assert.equal(decide([
    { model: 'a', verdict: 'APPROVE', summary: '' },
    { model: 'b', verdict: 'APPROVE', summary: '   ' },
  ]), 'INSUFFICIENT_REVIEWERS');
  assert.equal(decide([
    { model: 'a', verdict: 'APPROVE', summary: 'le diff est testé' },
    { model: 'b', verdict: 'APPROVE', summary: 'pas de garde-fou retiré' },
  ]), 'APPROVED');
  const env = { AI: { async run(m) { return { response: m.includes('gemma') ? 'oops' : '{"verdict":"REJECT","blocking":["import inexistant"]}' }; } } };
  assert.equal((await runCouncilReview(env, { diff: '+x' })).decision, 'REJECTED');
  const wf = await readFile(new URL('../.github/workflows/mel-candidate-promotion.yml', import.meta.url), 'utf8');
  assert.ok(wf.indexOf('/api/internal/council-review') > 0 && wf.indexOf('git push origin "$CAND:refs/heads/main"') > wf.indexOf('/api/internal/council-review'));
  assert.match(wf, /DECISION" != "APPROVED"/);
});

test('a recent failure is asked again only after the models that still answer', () => {
  const ids = ['@cf/openai/gpt-oss-120b', '@cf/meta/llama-3.3-70b-instruct-fp8-fast', '@cf/zai-org/glm-4.7-flash'];
  const now = 1_000_000;
  const cooling = orderCouncilModels(ids, { '@cf/openai/gpt-oss-120b': { ok: false, at: now - 60_000 } }, now);
  assert.equal(cooling[0], '@cf/meta/llama-3.3-70b-instruct-fp8-fast');
  assert.equal(cooling.at(-1), '@cf/openai/gpt-oss-120b');
  const refreshed = orderCouncilModels(ids, { '@cf/openai/gpt-oss-120b': { ok: false, at: now - 21 * 60 * 1000 } }, now);
  assert.equal(refreshed[0], '@cf/openai/gpt-oss-120b');
  assert.ok(freeCouncilCatalog({}).includes('@cf/zai-org/glm-4.7-flash'));
});

test('silent free models are replaced until three real answers exist', async () => {
  const called = [];
  const env = { AI: { async run(model) {
    called.push(model);
    if (String(model).includes('gpt-oss') || String(model).includes('nemotron')) throw new Error('DOWN');
    return { response: '{"verdict":"APPROVE","summary":"changement testé et branché"}' };
  } } };
  const result = await runCouncilReview(env, { diff: '+x' });
  assert.equal(result.decision, 'APPROVED');
  assert.ok(called.includes('@cf/zai-org/glm-4.7-flash'));
  assert.equal(result.reviews.filter(review => review.verdict === 'APPROVE').length, 3);
  assert.ok(result.reviews.some(review => review.error === 'DOWN'));
});

test('the Council asks the paired PC model when online models leave it short of answers', async () => {
  const env = { AI: { async run(model) {
    if (model.includes('gpt-oss')) return { response: '{"verdict":"APPROVE","summary":"changement testé et branché"}' };
    throw new Error('MODEL_UNAVAILABLE');
  } } };
  const inputs = [];
  const companion = async () => ({ async invoke({ input }) {
    inputs.push(input);
    return { text: '{"verdict":"APPROVE","summary":"relu sur le PC, correct et testé"}' };
  } });
  const result = await runCouncilReview(env, { diff: '+x'.repeat(30_000), companion });
  assert.equal(inputs.length, 1);
  assert.ok(inputs[0].length <= 12_000, 'the Companion refuses messages above 12 000 chars');
  assert.ok(result.reviews.some(review => review.model === 'companion-local-ai' && review.verdict === 'APPROVE'));
  assert.notEqual(result.decision, 'APPROVED', 'one cloud vote plus the PC is not a majority of every model asked');

  const unused = [];
  const healthy = { AI: { async run() { return { response: '{"verdict":"APPROVE","summary":"changement testé et branché"}' }; } } };
  await runCouncilReview(healthy, { diff: '+x', companion: async () => { unused.push(1); return null; } });
  assert.equal(unused.length, 0, 'online models answered: the PC is not asked');
});
