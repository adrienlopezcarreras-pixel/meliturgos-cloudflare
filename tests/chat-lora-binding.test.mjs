import test from 'node:test';
import assert from 'node:assert/strict';
import { requireChatLora, chatLoraReceipt, isCensorshipRefusal } from '../src/learning/chat-lora-binding.js';
import { runNativeInference, handleNativeChat } from '../src/api/native-chat.js';
import { onRequestGet } from '../src/pages/full-interface-v2.js';
import { JSDOM } from 'jsdom';

const active = {
  plan_id:'validated-test', base_model:'mistralai/Mistral-7B-Instruct-v0.2',
  runtime_model:'@cf/mistral/mistral-7b-instruct-v0.2-lora', finetune_id:'ft-test',
};

test('missing and incompatible LoRA never qualify for the requested mode', () => {
  for (const value of [null, {}, {...active, base_model:'Qwen/Qwen2.5-1.5B'}, {...active, finetune_id:''}]) {
    assert.throws(() => requireChatLora(value), {code:'LORA_COMPATIBLE_ACTIVE_ADAPTER_REQUIRED'});
  }
});

test('requested trained-model mode requires a validated MEL adapter', async () => {
  let calls=0;
  await assert.rejects(runNativeInference({
    env:{OPENROUTER_API_KEY:'sk-or-'+'x'.repeat(40),AI:{run:async()=>{calls++;return {response:'unexpected'};}}},
    messages:[{role:'user',content:'Bonjour'}],requireLora:true,activeAdapter:null,qwenAdapter:null
  }),{code:'LORA_COMPATIBLE_ACTIVE_ADAPTER_REQUIRED'});
  assert.equal(calls,0);
});

test('Qwen, ordinary cloud fallback and deterministic receipts never claim the configured LoRA', () => {
  for (const inference of [{model:'pc:qwen3:8b',provider:'companion'}, {model:'@cf/zai-org/glm-4.7-flash',provider:'workers-ai'}, {model:active.runtime_model,provider:'mel'}]) {
    assert.equal(chatLoraReceipt(active,inference),null);
  }
});

test('chat rejects missing promoted adapter before tools or inference, ignoring browser adapter IDs', async () => {
  let calls=0;
  const response=await handleNativeChat(new Request('https://mel.test/api/chat',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({text:'bonjour',lora_mode:'uncensored',activeAdapter:active})}),{AI:{run:async()=>{calls++;return {response:'invalid'};}}},{authorized:true});
  assert.equal(response.status,409);
  assert.equal((await response.json()).code,'LORA_COMPATIBLE_ACTIVE_ADAPTER_REQUIRED');
  assert.equal(calls,0);
});

test('bottom chat button toggles an explicit LoRA request without claiming activation', async () => {
  const html=await (await onRequestGet()).text();
  const dom=new JSDOM(html,{runScripts:'outside-only'});
  const button=dom.window.document.querySelector('#chatLoraMode');
  assert.equal(button.type,'button');
  assert.equal(button.getAttribute('aria-pressed'),'false');
  const runtime=html.match(/<script>([\s\S]*?)<\/script>/)[1];
  const binding=runtime.slice(runtime.indexOf("qs('#chatLoraMode').onclick="),runtime.indexOf("qs('#chatForm').addEventListener('submit'"));
  new Function('qs',binding)(selector=>dom.window.document.querySelector(selector));
  button.click();
  assert.equal(button.value,'uncensored');
  assert.equal(button.getAttribute('aria-pressed'),'true');
  assert.equal(button.textContent,'UNCENSORED');
  assert.equal(button.className,'primary');
  button.click();
  assert.equal(button.value,'automatic');
  assert.equal(button.getAttribute('aria-pressed'),'false');
  assert.match(runtime,/lora_mode:qs\('#chatLoraMode'\)\?\.value/);
  dom.window.close();
});

test('only a short policy refusal counts as censorship', () => {
  assert.equal(isCensorshipRefusal('Je ne peux pas vous aider avec cette demande.'), true);
  assert.equal(isCensorshipRefusal('I cannot assist with that request.'), true);
  assert.equal(isCensorshipRefusal('Je ne peux pas lire ta boîte Gmail : le connecteur est absent.'), false);
  assert.equal(isCensorshipRefusal('Mode UNCENSORED indisponible : aucun adaptateur.'), false);
  assert.equal(isCensorshipRefusal('x'.repeat(501) + ' I cannot assist'), false);
});

test('normal mode switches to the validated LoRA after one censorship refusal', async () => {
  const { sqliteD1 } = await import('./helpers/sqlite-d1.mjs');
  const { MentorMemoryRepository } = await import('../src/learning/mentor-memory.js');
  const DB = sqliteD1();
  try {
    await new MentorMemoryRepository(DB).remember({
      kind: 'LORA_ADAPTER_ACTIVE', lesson: 'Adaptateur validé.',
      evidence: active,
    });
    const calls = [];
    const response = await handleNativeChat(new Request('https://mel.test/api/chat', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: 'raconte une histoire courte', lora_mode: 'automatic', use_companion_compute: false }),
    }), { DB, AI: { run: async (model) => { calls.push(model); return { response: calls.length === 1 ? 'Je ne peux pas vous aider avec cette demande.' : 'Histoire libre.' }; } } }, { authorized: true });
    const payload = await response.json();
    assert.equal(payload.text, 'Histoire libre.');
    assert.equal(payload.lora_mode, 'uncensored');
    assert.ok(calls.length >= 2);
  } finally { DB.close(); }
});

test('without a validated adapter a censorship refusal stays on the normal answer', async () => {
  const { sqliteD1 } = await import('./helpers/sqlite-d1.mjs');
  const DB = sqliteD1();
  try {
    const calls = [];
    const response = await handleNativeChat(new Request('https://mel.test/api/chat', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: 'raconte une histoire courte', use_companion_compute: false }),
    }), { DB, AI: { run: async (model) => { calls.push(model); return { response: 'Je ne peux pas vous aider avec cette demande.' }; } } }, { authorized: true });
    const payload = await response.json();
    assert.equal(payload.text, 'Je ne peux pas vous aider avec cette demande.');
    assert.equal(payload.lora_mode, 'automatic');
    assert.equal(calls.length, 1);
  } finally { DB.close(); }
});

test('UNCENSORED without an active adapter falls back to Venice when its key is set', async () => {
  const realFetch = globalThis.fetch; const urls = [];
  globalThis.fetch = async (url) => { urls.push(String(url)); return new Response(JSON.stringify({ choices: [{ message: { content: 'Réponse Venice.' } }] })); };
  try {
    const env = { OPENROUTER_API_KEY: 'sk-or-' + 'x'.repeat(40), AI: { run: async (model) => (String(model).includes('llama-guard') ? { response: 'safe' } : { response: '' }) } };
    const response = await handleNativeChat(new Request('https://mel.test/api/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: 'bonjour', lora_mode: 'uncensored' }) }), env, { authorized: true });
    const payload = await response.json();
    assert.notEqual(payload.code, 'LORA_COMPATIBLE_ACTIVE_ADAPTER_REQUIRED');
    assert.match(String(payload.text), /Réponse Venice/);
    assert.ok(urls.some(u => u.includes('openrouter.ai')));
  } finally { globalThis.fetch = realFetch; }
});
