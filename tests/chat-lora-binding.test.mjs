import test from 'node:test';
import assert from 'node:assert/strict';
import { requireChatLora, chatLoraReceipt } from '../src/learning/chat-lora-binding.js';
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

test('required LoRA pins its model despite an incompatible preferred model or fanout', async () => {
  const calls=[];
  const result=await runNativeInference({env:{AI:{run:async (model,input)=>{calls.push({model,input});return {response:'Réponse du modèle adapté.'};}}},
    messages:[{role:'user',content:'Bonjour'}], text:'bonjour', activeAdapter:active,
    requireLora:true, parallel:true, preferredModel:'@cf/zai-org/glm-4.7-flash'});
  assert.equal(calls.length,1);
  assert.equal(calls[0].model,active.runtime_model);
  assert.equal(calls[0].input.lora,active.finetune_id);
  assert.equal(chatLoraReceipt(active,result)?.applied,true);
});

test('required LoRA provider failure cannot execute another cloud model', async () => {
  const calls=[];
  await assert.rejects(()=>runNativeInference({env:{AI:{run:async(model)=>{calls.push(model);throw Object.assign(new Error('provider unavailable'),{code:'PROVIDER_UNAVAILABLE'});}}},
    messages:[{role:'user',content:'Bonjour'}], text:'bonjour', activeAdapter:active, requireLora:true}));
  assert.deepEqual(calls,[active.runtime_model]);
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
  assert.match(button.textContent,/requis/);
  button.click();
  assert.equal(button.value,'automatic');
  assert.equal(button.getAttribute('aria-pressed'),'false');
  assert.match(runtime,/lora_mode:qs\('#chatLoraMode'\)\?\.value/);
  dom.window.close();
});
