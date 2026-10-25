import test from 'node:test';
import assert from 'node:assert/strict';
import { sqliteD1 } from './helpers/sqlite-d1.mjs';
import { withNeuronBudget, estimateNeurons, readNeuronBudget } from '../src/augmentio/neuron-budget.js';

const model = '@cf/openai/gpt-oss-120b';
function aiFake(calls) {
  return { run: async (m, inputs) => { calls.push(m); return { response: 'ok', usage: { prompt_tokens: 100000, completion_tokens: 10000 } }; }, models: () => 'list' };
}

test('Workers AI calls stop at the daily neuron cap and resume the next UTC day', async () => {
  const db = await sqliteD1();
  const calls = [];
  let now = Date.parse('2026-10-25T10:00:00Z');
  const env = withNeuronBudget({ DB: db, AI: aiFake(calls), MEL_AI_DAILY_NEURON_CAP: '9000' }, { now: () => now });
  // 100k in + 10k out on gpt-oss-120b ≈ 3864 neurons per call.
  await env.AI.run(model, { messages: [] });
  await env.AI.run(model, { messages: [] });
  await env.AI.run(model, { messages: [] });
  await assert.rejects(env.AI.run(model, { messages: [] }), error => error.code === 'WORKERS_AI_DAILY_NEURON_BUDGET_EXHAUSTED');
  assert.equal(calls.length, 3);
  const budget = await readNeuronBudget(db, { now });
  assert.ok(budget.neurons > 9000 && budget.refused === 1);
  assert.equal(env.AI.models(), 'list');
  now = Date.parse('2026-10-26T00:01:00Z');
  await env.AI.run(model, { messages: [] });
  assert.equal(calls.length, 4);
});

test('an unreadable budget refuses instead of spending', async () => {
  const calls = [];
  const env = withNeuronBudget({ DB: { prepare() { throw new Error('D1 down'); } }, AI: aiFake(calls) });
  await assert.rejects(env.AI.run(model, {}), error => error.code === 'WORKERS_AI_NEURON_BUDGET_UNAVAILABLE');
  assert.equal(calls.length, 0);
});

test('unknown and streamed calls are charged conservatively', () => {
  assert.ok(estimateNeurons('@cf/unknown/model', { prompt: 'x'.repeat(4000) }, new ReadableStream()) > estimateNeurons(model, { prompt: 'x'.repeat(4000) }, { response: 'y' }));
  assert.equal(estimateNeurons('@cf/black-forest-labs/flux-1-schnell', {}, {}), 2000);
});
