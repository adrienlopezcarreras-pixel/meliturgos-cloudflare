import test from 'node:test';
import assert from 'node:assert/strict';
import { inferenceGenerationOptions, runNativeInference, loadCognitiveMemory } from '../src/api/native-chat.js';

test('promoted inference generation settings reach the direct AI payload', async () => {
  const calls = [];
  const env = { AI: { run: async (model, payload) => { calls.push({ model, payload }); return { response: 'ok' }; } } };
  const settings = { temperature: 0.22, top_p: 0.81, max_tokens: 3072, memory_results: 7, review_passes: 2, council_min_responses: 3 };
  const result = await runNativeInference({ env, messages: [{ role: 'user', content: 'hello' }], text: 'hello', inferenceSettings: settings });
  assert.equal(result.text, 'ok');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].payload.temperature, 0.22);
  assert.equal(calls[0].payload.top_p, 0.81);
  assert.equal(calls[0].payload.max_tokens, 3072);
  assert.equal('review_passes' in calls[0].payload, false);
  assert.equal('memory_results' in calls[0].payload, false);
});

test('no promoted settings preserves provider defaults', async () => {
  const options = inferenceGenerationOptions(null);
  assert.deepEqual(options, {});
  const calls = [];
  const env = { AI: { run: async (_model, payload) => { calls.push(payload); return { response: 'ok' }; } } };
  await runNativeInference({ env, messages: [{ role: 'user', content: 'hello' }], text: 'hello' });
  assert.deepEqual(Object.keys(calls[0]).sort(), ['messages']);
});

test('memory_results bounds the cognitive-memory retrieval count', async () => {
  const rows = Array.from({ length: 20 }, (_, i) => ({ content: 'm' + i, importance: 20 - i, source: 'test', created_at: i }));
  const env = { DB: { prepare(sql) { return { bind() { return this; }, async run() { return { success: true }; }, async all() { return sql.includes('SELECT * FROM memories') ? { results: rows } : { results: [] }; } }; } } };
  const retrieved = await loadCognitiveMemory(env, 5);
  assert.equal(retrieved.count, 5);
});
