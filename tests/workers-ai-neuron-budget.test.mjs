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

test('realtime voice bypasses multi-minute PC jobs and never sends internal routing marker to Cloudflare', async () => {
  const db = sqliteD1();
  const cloud = [];
  let pcCalls = 0;
  const env = withNeuronBudget({
    DB: db,
    AI: {run: async (_model, payload) => {
      cloud.push(payload);
      return {response:'Voix disponible',usage:{prompt_tokens:5,completion_tokens:5}};
    }},
  }, {
    localRun: async () => {pcCalls++; return {response:'réponse lente du pc'};},
  });
  const payload = {
    neuron_reserve: true,
    messages: [{role:'user',content:'Bonjour MEL'}],
    max_tokens:120
  };
  const answer = await env.AI.run('@cf/meta/llama-3.1-8b-instruct-fast', payload);
  assert.equal(answer.response, 'Voix disponible');
  assert.equal(pcCalls, 0);
  assert.equal(cloud.length, 1);
  assert.equal(cloud[0].neuron_reserve, undefined);
  assert.deepEqual(cloud[0].messages, payload.messages);
  assert.equal(cloud[0].max_tokens, 120);
  assert.equal(payload.neuron_reserve, true, 'do not mutate caller-owned data');
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

test('every Workers AI text model in ModelRegistry has its official neuron rate', async () => {
  const { estimateNeurons } = await import('../src/augmentio/neuron-budget.js');
  const { standardRegistry } = await import('../src/models/ModelRegistry.js');
  const unknownCeiling = estimateNeurons('@cf/unknown/model', { messages: 'x'.repeat(4000) }, { usage: { prompt_tokens: 1000, completion_tokens: 1000 } });
  for (const model of standardRegistry.list().filter(m => String(m.id).startsWith('@cf/'))) {
    const cost = estimateNeurons(model.id, {}, { usage: { prompt_tokens: 1000, completion_tokens: 1000 } });
    assert.ok(cost < unknownCeiling, model.id + ' is charged at the unknown-model ceiling');
  }
  assert.equal(Math.round(estimateNeurons('@cf/zai-org/glm-4.7-flash', {}, { usage: { prompt_tokens: 1e6, completion_tokens: 1e6 } })), 5500 + 36400);
});

test('an owner-granted bonus lets calls through past the cap until spent or expired', async () => {
  const { grantNeuronBonus, readNeuronBonus } = await import('../src/augmentio/neuron-budget.js');
  const db = sqliteD1();
  const t = Date.parse('2026-10-26T10:00:00Z');
  let calls = 0;
  const env = withNeuronBudget({ DB: db, MEL_AI_DAILY_NEURON_CAP: '10', AI: { run: async () => { calls++; return { response: 'ok', usage: { prompt_tokens: 1000, completion_tokens: 1000 } }; } } }, { now: () => t });
  await env.AI.run('@cf/zai-org/glm-4.7-flash', {});
  await assert.rejects(env.AI.run('@cf/zai-org/glm-4.7-flash', {}), { code: 'WORKERS_AI_DAILY_NEURON_BUDGET_EXHAUSTED' });
  await grantNeuronBonus(db, { id: 'owner-2-days', neurons: 50, expiresAt: t + 7 * 86_400_000, reason: 'test' });
  await env.AI.run('@cf/zai-org/glm-4.7-flash', {});
  assert.ok((await readNeuronBonus(db, { now: t })).remaining < 50, 'the bonus is consumed');
  await env.AI.run('@cf/zai-org/glm-4.7-flash', {});
  assert.equal(await readNeuronBonus(db, { now: t }), null, 'a spent bonus is gone');
  await assert.rejects(env.AI.run('@cf/zai-org/glm-4.7-flash', {}), { code: 'WORKERS_AI_DAILY_NEURON_BUDGET_EXHAUSTED' });
  await grantNeuronBonus(db, { id: 'expired', neurons: 50, expiresAt: t - 1 });
  await assert.rejects(env.AI.run('@cf/zai-org/glm-4.7-flash', {}), { code: 'WORKERS_AI_DAILY_NEURON_BUDGET_EXHAUSTED' });
  assert.equal(calls, 3);
});

test('text the PC can answer does not spend neurons, and a reserved vote still does', async () => {
  const db = sqliteD1();
  const calls = [];
  const env = withNeuronBudget({
    DB: db,
    AI: aiFake(calls),
    MEL_AI_DAILY_NEURON_CAP: '9000',
  }, {
    now: () => Date.parse('2026-10-26T10:00:00Z'),
    localRun: async () => ({ response: 'réponse du pc', model: 'pc:qwen3:8b', local: true }),
  });
  const local = await env.AI.run(model, { messages: [{ role: 'user', content: 'bonjour' }] });
  assert.equal(local.response, 'réponse du pc');
  assert.equal(calls.length, 0);
  assert.equal((await readNeuronBudget(db, { now: Date.parse('2026-10-26T10:00:00Z') })).neurons, 0);
  await env.AI.run(model, { neuron_reserve: true, messages: [{ role: 'user', content: 'vote' }] });
  await env.AI.run('@cf/bytedance/stable-diffusion-xl-lightning', { prompt: 'cercle' });
  assert.equal(calls.length, 2);
});
