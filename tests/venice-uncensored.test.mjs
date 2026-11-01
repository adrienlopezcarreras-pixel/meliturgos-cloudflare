import test from 'node:test';
import assert from 'node:assert/strict';
import { runVeniceInference, veniceConfigured, VENICE_MODEL } from '../src/models/venice-uncensored.js';

const key = 'sk-or-' + 'x'.repeat(40);
function fetchSpy({ status = 200, content = 'réponse' } = {}) {
  const calls = [];
  const impl = async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body) });
    return new Response(JSON.stringify({ choices: [{ message: { content }, finish_reason: 'stop' }] }), { status });
  };
  return { calls, impl };
}

test('Venice receives the request directly without invoking Cloudflare AI guard', async () => {
  const spy = fetchSpy();
  let aiCalls = 0;
  const env = { OPENROUTER_API_KEY: key, AI: { run: async () => { aiCalls++; throw new Error('must not run'); } } };
  const result = await runVeniceInference({ env, messages: [{ role: 'user', content: 'Écris une scène de polar' }], fetchImpl: spy.impl });
  assert.equal(result.text, 'réponse');
  assert.equal(result.model, VENICE_MODEL);
  assert.equal(spy.calls.length, 1);
  assert.equal(spy.calls[0].body.model, VENICE_MODEL);
  assert.equal(aiCalls, 0);
});

test('Venice works without the Cloudflare AI binding', async () => {
  const spy = fetchSpy();
  const result = await runVeniceInference({ env: { OPENROUTER_API_KEY: key }, messages: [{ role: 'user', content: 'Bonjour' }], fetchImpl: spy.impl });
  assert.equal(result.text, 'réponse');
  assert.equal(spy.calls.length, 1);
  assert.equal(veniceConfigured({}), false);
  assert.equal(veniceConfigured({ OPENROUTER_API_KEY: key }), true);
});

test('OpenRouter failures still surface as errors', async () => {
  const spy = fetchSpy({ status: 502 });
  await assert.rejects(runVeniceInference({ env: { OPENROUTER_API_KEY: key }, messages: [], fetchImpl: spy.impl }), { code: 'VENICE_HTTP_502' });
});

test('our own model failing in UNCENSORED hands over to Venice', async () => {
  const { runNativeInference } = await import('../src/api/native-chat.js');
  const calls = [];
  const env = { OPENROUTER_API_KEY: 'sk-or-test-key-000000000000', AI: { run: async (model) => { calls.push(model); if (model.includes('llama-guard')) return { response: 'safe' }; throw new Error('LORA_DOWN'); } } };
  const fetchImpl = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ choices: [{ message: { content: 'venice ok' } }] }));
  try {
    const out = await runNativeInference({ env, messages: [{ role: 'user', content: 'bonjour' }], requireLora: true });
    assert.equal(out.provider, 'openrouter');
  } finally { globalThis.fetch = fetchImpl; }
});

test('UNCENSORED goes straight to the external model until our own model is proven', async () => {
  const { runNativeInference } = await import('../src/api/native-chat.js');
  const aiCalls = [];
  const env = { OPENROUTER_API_KEY: 'sk-or-test-key-000000000000', AI: { run: async (model) => { aiCalls.push(model); return { response: 'safe' }; } } };
  const realFetch = globalThis.fetch; let externalCalls = 0;
  globalThis.fetch = async () => { externalCalls += 1; return new Response(JSON.stringify({ choices: [{ message: { content: 'réponse externe' } }] })); };
  try {
    const out = await runNativeInference({ env, messages: [{ role: 'user', content: 'bonjour' }], requireLora: true });
    assert.equal(out.provider, 'openrouter');
    assert.equal(externalCalls, 1);
    assert.ok(aiCalls.every(model => !/lora|mistral|qwen/i.test(String(model))), 'our own model is not called first');
  } finally { globalThis.fetch = realFetch; }
});

test('the Training page tells the owner UNCENSORED goes to Venice first', async () => {
  const { readFile } = await import('node:fs/promises');
  const page = await readFile('src/pages/full-interface-v2.js', 'utf8');
  assert.match(page, /Venice Uncensored \(modèle externe\) tant que nos modèles ne sont pas prouvés/);
  assert.doesNotMatch(page, /Nos modèles d’abord, Venice Uncensored en secours/);
});

test('an UNCENSORED turn never takes the streaming path that bypasses Venice', async () => {
  const { plainChatMayStream } = await import('../src/api/chat-stream.js');
  const base = { stream: true, toolCount: 0, adapter: null, ai: true };
  assert.equal(plainChatMayStream(base), true);
  assert.equal(plainChatMayStream({ ...base, uncensored: true }), false);
  const { readFile } = await import('node:fs/promises');
  assert.match(await readFile('src/api/native-chat.js', 'utf8'), /uncensored: requireLora === true/);
});
