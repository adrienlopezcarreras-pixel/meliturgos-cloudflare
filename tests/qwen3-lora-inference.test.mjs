import test from 'node:test';
import assert from 'node:assert/strict';
import {requireActiveQwen3Lora, runQwen3LoraInference, qwen3LoraReceipt} from '../src/learning/qwen3-lora-inference.js';
import {runNativeInference} from '../src/api/native-chat.js';

const digest = 'sha256:' + 'a'.repeat(64);
const active = {
  base_model: 'Qwen/Qwen3-14B',
  adapter_id: 'mel-qwen-candidate-validated-001',
  adapter_sha256: digest,
  benchmark: {approved: true},
  activation: {approved: true, approval_id: 'owner-approved-candidate'},
};
const env = (handler) => ({
  MEL_QWEN3_LORA_BUDGET_APPROVED: 'true',
  QWEN3_LORA_SERVICE: {fetch: handler},
});
const messages = [{role:'system',content:'Reste clair et factuel.'}, {role:'user',content:'Bonjour.'}];

test('Qwen3 refuses unapproved/mismatched adapters and absent cloud binding', () => {
  for (const broken of [
    null, {...active, base_model:'Qwen/Qwen2.5-14B'},
    {...active, adapter_sha256:'fake'},
    {...active, benchmark:{approved:false}},
    {...active, activation:{approved:false}},
  ]) assert.throws(() => requireActiveQwen3Lora(broken,env(()=>null)));
  assert.throws(() => requireActiveQwen3Lora(active,{}), {code:'QWEN3_TRUSTED_SERVICE_NOT_CONFIGURED'});
});

test('validated Qwen fallback preserves messages and returns honest exact receipt', async () => {
  const calls = [];
  const runtime = env(async request => {
    const body = await request.json();
    calls.push(body);
    return Response.json({
      text: 'Qwen3 répond.',
      model: body.model,
      adapter_id: body.adapter_id,
      adapter_sha256: body.adapter_sha256,
      adapter_applied: true,
    });
  });
  const result = await runQwen3LoraInference({env:runtime, active, messages, deadlineAt:Date.now()+5000});
  assert.equal(calls.length,1);
  assert.equal(calls[0].model,'Qwen/Qwen3-14B');
  assert.equal(calls[0].adapter_id,active.adapter_id);
  assert.deepEqual(calls[0].messages,messages);
  assert.equal(result.text,'Qwen3 répond.');
  assert.equal(qwen3LoraReceipt(active,result)?.applied,true);
  assert.equal(qwen3LoraReceipt(null,result),null);
  assert.equal(qwen3LoraReceipt(active,{...result,provider:'workers-ai'}),null);
});

test('missing service proof, empty answer and exhausted budget are not success', async () => {
  const runtime=env(async () => Response.json({
    text:'Réponse non attestée', model: 'Qwen/Qwen3-14B',
    adapter_id:active.adapter_id, adapter_applied:true,
  }));
  await assert.rejects(runQwen3LoraInference({env:runtime,active,messages}),
    {code:'QWEN3_ADAPTER_RECEIPT_MISMATCH'});
  const empty=env(async () => Response.json({
    text:'',model:'Qwen/Qwen3-14B',adapter_id:active.adapter_id,
    adapter_sha256:digest,adapter_applied:true,
  }));
  await assert.rejects(runQwen3LoraInference({env:empty,active,messages}),
    {code:'QWEN3_EMPTY_SERVICE_RESPONSE'});
  await assert.rejects(runQwen3LoraInference({env:empty,active,messages,deadlineAt:Date.now()-100}),
    {code:'QWEN3_INFERENCE_DEADLINE'});
});


const mistral = {
  plan_id:'approved-a', base_model:'mistralai/Mistral-7B-Instruct-v0.2',
  runtime_model:'@cf/mistral/mistral-7b-instruct-v0.2-lora', finetune_id:'ft-approved',
};

test('explicit UNCENSORED bypasses Qwen and Mistral when Venice is configured', async () => {
  let localCalls = 0, qwenCalls = 0, externalCalls = 0;
  const runtime = {
    ...env(async () => {qwenCalls++;return Response.json({text:'unexpected'});}),
    OPENROUTER_API_KEY:'sk-or-'+'x'.repeat(40),
    AI:{run:async()=>{localCalls++;return {response:'unexpected'};}},
  };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    externalCalls++;
    return Response.json({choices:[{message:{content:'Venice répond.'}}]});
  };
  try {
    const result = await runNativeInference({env:runtime,messages,requireLora:true,activeAdapter:mistral,qwenAdapter:active});
    assert.equal(result.provider,'openrouter');
    assert.equal(result.text,'Venice répond.');
    assert.equal(externalCalls,1);
    assert.equal(localCalls,0);
    assert.equal(qwenCalls,0);
  } finally {globalThis.fetch=originalFetch;}
});

test('explicit UNCENSORED does not use Qwen without a Venice key', async () => {
  let calls=0;
  const runtime=env(async()=>{calls++;return Response.json({text:'unexpected'});});
  await assert.rejects(runNativeInference({env:runtime,messages,requireLora:true,qwenAdapter:active}),{code:'VENICE_KEY_MISSING'});
  assert.equal(calls,0);
});

test('an explicit UNCENSORED continuation also requires Venice, not Qwen', async () => {
  let qwenCalls=0;
  const runtime=env(async()=>{qwenCalls++;return Response.json({text:'unexpected'});});
  await assert.rejects(runNativeInference({
    env:runtime,messages,requireLora:true,activeAdapter:mistral,
    qwenAdapter:active,preferredModel:'Qwen/Qwen3-14B'
  }),{code:'VENICE_KEY_MISSING'});
  assert.equal(qwenCalls,0);
});
