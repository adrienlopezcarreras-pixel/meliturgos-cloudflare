import test from 'node:test';
import assert from 'node:assert/strict';
import { ProviderAdapter } from '../src/augmentio/provider-adapter.js';
import { ProviderPool } from '../src/augmentio/provider-pool.js';
import { createWorkersAIAdapter } from '../src/augmentio/workers-ai-adapter.js';
import { QuotaArbitrator } from '../src/augmentio/quota-arbitrator.js';
import { buildTeacherEscalation } from '../src/augmentio/teacher-escalation.js';

test('provider adapter exposes health quota latency and model metadata', async () => {
  const adapter = new ProviderAdapter({
    id: 'mock:model', providerId: 'mock', modelId: 'm1', capabilities: ['GENERAL'], estimatedCost: 0,
    healthCheck: async () => 'HEALTHY', quotaSnapshot: async () => ({ remaining: 3 }), invoke: async () => ({ text: 'ok' }),
  });
  assert.equal(await adapter.health(), 'HEALTHY');
  assert.deepEqual(await adapter.quota(), { remaining: 3 });
  await adapter.invoke({ input: 'x' });
  assert.equal(adapter.latencyStats().calls, 1);
  assert.equal(adapter.latencyStats().successes, 1);
  assert.equal(adapter.providerId, 'mock');
  assert.equal(adapter.modelId, 'm1');
});

test('provider pool refreshes dynamic health and excludes unavailable routes', async () => {
  let status = 'HEALTHY';
  const adapter = new ProviderAdapter({ id: 'dynamic', estimatedCost: 0, healthCheck: async () => status, invoke: async () => 'ok' });
  const pool = new ProviderPool([adapter]);
  await pool.refreshHealth();
  assert.equal(pool.list().length, 1);
  status = 'UNAVAILABLE';
  await pool.refreshHealth();
  assert.equal(pool.list().length, 0);
});

test('Workers AI adapter calls env.AI.run with messages and preserves provenance', async () => {
  const calls = [];
  const env = {
    AI: {
      async run(model, payload) {
        calls.push({ model, payload });
        return { response: 'hello from workers ai' };
      },
    },
  };
  const adapter = createWorkersAIAdapter({ env, modelId: '@cf/example/model', capabilities: ['GENERAL'] });
  assert.equal(await adapter.health(), 'HEALTHY');
  const quota = await adapter.quota();
  assert.equal(quota.known, false);
  const result = await adapter.invoke({ input: 'bonjour', context: { system: 'You are MEL' } });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].model, '@cf/example/model');
  assert.deepEqual(calls[0].payload.messages, [
    { role: 'system', content: 'You are MEL' },
    { role: 'user', content: 'bonjour' },
  ]);
  assert.equal(result.text, 'hello from workers ai');
  assert.equal(result.provenance.provider, 'workers-ai');
});

test('Workers AI adapter applies measured settings and an explicitly activated LoRA only when supplied', async () => {
  const calls = [];
  const env = { AI: { async run(model, payload) { calls.push({ model, payload }); return { response: 'adapted' }; } } };
  const adapter = createWorkersAIAdapter({ env, modelId: '@cf/example/lora-compatible' });
  const result = await adapter.invoke({
    input: 'test',
    context: {
      inference_settings: { temperature: 0.25, top_p: 0.8, max_tokens: 1536 },
      lora: 'mel-adapter-v1',
    },
  });
  assert.equal(calls[0].payload.temperature, 0.25);
  assert.equal(calls[0].payload.top_p, 0.8);
  assert.equal(calls[0].payload.max_tokens, 1536);
  assert.equal(calls[0].payload.lora, 'mel-adapter-v1');
  assert.equal(result.provenance.lora_applied, true);
  assert.deepEqual(result.provenance.inference_settings_applied.sort(), ['max_tokens', 'temperature', 'top_p']);
});

test('quota arbitrator cools down a rate-limited provider', () => {
  const quota = new QuotaArbitrator({ cooldownMs: 60_000 });
  quota.recordFailure('p1', { status: 429, message: 'rate limit' });
  assert.equal(quota.isAvailable('p1'), false);
  assert.equal(quota.filter([{ id: 'p1' }, { id: 'p2' }]).map((p) => p.id).join(','), 'p2');
});

test('teacher escalation exposes MEL answer and all candidates for review', () => {
  const payload = buildTeacherEscalation({
    requestId: 'req-1',
    input: 'solve',
    capability: 'REASONING',
    result: {
      best: { provider: 'p2', text: 'best' },
      candidates: [{ provider: 'p1', text: 'a' }, { provider: 'p2', text: 'best' }],
      failures: 1,
    },
  });
  assert.equal(payload.type, 'MEL_REQUEST');
  assert.equal(payload.subtype, 'MULTI_AI_REVIEW');
  assert.equal(payload.request_id, 'req-1');
  assert.equal(payload.candidates.length, 2);
  assert.equal(payload.requires_teacher_decision, true);
});