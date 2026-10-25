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

test('background work stops at its share so the chat keeps a reserve', async () => {
  const db = await sqliteD1();
  const calls = [];
  const now = () => Date.parse('2026-11-02T10:00:00Z');
  const cron = withNeuronBudget({ DB: db, AI: aiFake(calls), MEL_AI_DAILY_NEURON_CAP: '9000' }, { now, background: true });
  const chat = withNeuronBudget({ DB: db, AI: aiFake(calls), MEL_AI_DAILY_NEURON_CAP: '9000' }, { now });
  await cron.AI.run(model, {});
  await cron.AI.run(model, {});
  await assert.rejects(cron.AI.run(model, {}), error => error.code === 'WORKERS_AI_DAILY_NEURON_BUDGET_EXHAUSTED');
  await chat.AI.run(model, {});
  assert.equal(calls.length, 3);
});

test('MAX waits for the next UTC day instead of failing missions once its share is spent', async () => {
  const { runAutonomyRuntimeTick } = await import('../src/evolution/autonomy-runtime.js');
  const db = await sqliteD1();
  const env = { DB: db, MEL_AI_DAILY_NEURON_CAP: '9000' };
  const { setAutonomyControl } = await import('../src/evolution/autonomy-control.js');
  await setAutonomyControl(db, { paused: false, actor: 'test', reason: 'test' });
  await readNeuronBudget(db);
  const day = new Date().toISOString().slice(0, 10);
  await db.prepare('INSERT INTO mel_ai_neuron_budget (day, neurons, calls) VALUES (?, 5400, 10)').bind(day).run();
  const result = await runAutonomyRuntimeTick(env);
  assert.equal(result.status, 'AI_BUDGET_EXHAUSTED');
  assert.equal(result.progress.block_reason, 'AI_DAILY_NEURON_BUDGET_EXHAUSTED');
});
