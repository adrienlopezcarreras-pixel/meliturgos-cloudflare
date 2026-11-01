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

test('LoRA selection with no promoted adapter does not contact Venice or generic cloud AI', async () => {
  const { runNativeInference } = await import('../src/api/native-chat.js');
  let aiCalls=0;
  await assert.rejects(runNativeInference({
    env: { OPENROUTER_API_KEY: key, AI: { run: async () => { aiCalls++; return {response:'unexpected'}; } } },
    messages: [{role:'user',content:'Bonjour'}], requireLora:true,
  }), { code:'LORA_COMPATIBLE_ACTIVE_ADAPTER_REQUIRED' });
  assert.equal(aiCalls,0);
});

test('an explicitly selected LoRA turn does not use generic chat streaming', async () => {
  const { plainChatMayStream } = await import('../src/api/chat-stream.js');
  const base={stream:true,toolCount:0,adapter:null,ai:true};
  assert.equal(plainChatMayStream(base),true);
  assert.equal(plainChatMayStream({...base,uncensored:true}),false);
});
