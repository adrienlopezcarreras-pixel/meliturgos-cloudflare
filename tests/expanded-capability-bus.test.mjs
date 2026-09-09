import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultCapabilityBus } from '../src/capabilities/default-bus.js';

const context = { owner: 'adrien', permissions: [], requestId: 'test' };

test('default CapabilityBus exposes real planning, memory, diagnostics and orchestration capabilities', () => {
  const bus = createDefaultCapabilityBus({ env: { MELITURGOS_USER: 'adrien' }, fetchImpl: async () => new Response('', { status: 503 }) });
  const ids = new Set(bus.list().map(x => x.id));
  for (const id of ['echo','code.read','code.search','augmentio.fanout','roadmap.read','system.bindings','rag.search','conversation.list','chatgpt.archive.preview']) {
    assert.ok(ids.has(id), `missing ${id}`);
  }
  assert.ok(ids.size >= 9);
});

test('roadmap and system diagnostics execute through CapabilityBus', async () => {
  const bus = createDefaultCapabilityBus({ env: { MELITURGOS_USER: 'adrien', AI: {}, DB: {} }, fetchImpl: async () => new Response('', { status: 503 }) });
  const roadmap = await bus.execute('roadmap.read', {}, context);
  assert.equal(roadmap.ok, true);
  assert.ok(roadmap.summary.total >= 90);
  const bindings = await bus.execute('system.bindings', {}, context);
  assert.equal(bindings.ai, true);
  assert.equal(bindings.db, true);
  assert.equal(bindings.owner_configured, true);
});

test('augmentio.fanout CapabilityBus handler runs actual configured zero-cost models', async () => {
  const calls = [];
  const env = {
    MELITURGOS_USER: 'adrien',
    AI: { run: async (model, payload) => { calls.push({ model, payload }); return { response: 'réponse '+model }; } }
  };
  const bus = createDefaultCapabilityBus({ env, fetchImpl: async () => new Response('', { status: 503 }) });
  const result = await bus.execute('augmentio.fanout', { input: 'état des lieux', maxCandidates: 3 }, context);
  assert.ok(result.best?.text);
  assert.ok(result.candidates.length >= 1);
  assert.ok(calls.length >= 1);
  assert.ok(result.providersAttempted.every(x => x.startsWith('workers-ai:')));
});
