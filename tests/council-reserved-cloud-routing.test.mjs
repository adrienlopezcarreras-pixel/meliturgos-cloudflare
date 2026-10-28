import test from 'node:test';
import assert from 'node:assert/strict';
import { withLearnedRuntime } from '../src/learning-entry.js';
import { sqliteD1 } from './helpers/sqlite-d1.mjs';
import { withNeuronBudget,readNeuronBudget } from '../src/augmentio/neuron-budget.js';
import { bindLocalPcWorkersAi } from '../src/models/local-pc-model.js';
import { prepareDevelopmentRequest } from '../src/evolution/development-preflight.js';
import { createWorkersAIAdapter } from '../src/augmentio/workers-ai-adapter.js';
process.env.MEL_TEST_VERIFIED_ZERO_COST_PROVIDERS='1';
const MODEL='@cf/meta/llama-3.3-70b-instruct-fp8-fast';

test('real Council through the deployed budget wrapper uses distinct cloud bindings, not one disguised PC model',async()=>{
  const DB=sqliteD1();const cloud=[],budgetLocal=[],coderLocal=[];
  try {
    const env=withNeuronBudget({DB,AI:{run:async(model,inputs)=>{cloud.push({model,inputs});return {response:'Independent cloud fixture response for '+model,usage:{prompt_tokens:10,completion_tokens:10}};}}},{localRun:async()=>{budgetLocal.push('local');return {response:'one local model pretending to be every cloud model',model:'pc:qwen3:8b',local:true};}});
    bindLocalPcWorkersAi(env,async()=>{coderLocal.push('coder');return {ok:true,text:'local code',model:'pc:qwen2.5-coder:7b'};});
    const councilEnv=withLearnedRuntime({...env,AI:env.MEL_CLOUD_AI,MEL_INFERENCE:undefined});
    const result=await prepareDevelopmentRequest({env:councilEnv,goal:'Inspect the existing bounded module without creating a duplicate'});
    assert.equal(result.council.status,'COMPLETE');
    assert.equal(budgetLocal.length,0,'budget wrapper must never send independent Council votes to the PC');
    assert.equal(coderLocal.length,0,'Council must bypass the coding wrapper');
    assert.ok(new Set(cloud.map(row=>row.model)).size>=2,'actual mocked cloud bindings, not provider labels, supply the distinct votes');
    assert.ok(cloud.every(row=>!Object.hasOwn(row.inputs,'neuron_reserve')),'internal routing marker is consumed by the meter before Cloudflare');
    assert.ok(cloud.every(row=>row.inputs.max_tokens<=768),'Council must not inherit the 4096-token chat output default');
    assert.equal((await readNeuronBudget(DB)).calls,cloud.length,'cloud Council calls still pass through the budget meter');
    const before=cloud.length;
    assert.equal((await env.AI.run('@cf/qwen/qwen2.5-coder-32b-instruct',{messages:[{role:'user',content:'write the approved function'}]})).local,true);
    assert.equal(coderLocal.length,1);assert.equal(cloud.length,before,'ordinary development stays on the opted-in local coder');
  }finally{DB.close();}
});

test('reserved Council through both wrappers remains refused when the cloud budget is spent',async()=>{
  const DB=sqliteD1();let cloud=0,local=0;
  try {
    const env=withNeuronBudget({DB,AI:{run:async()=>{cloud++;return {response:'cloud'};}}},{localRun:async()=>{local++;return {response:'local'};}});
    await readNeuronBudget(DB);await DB.prepare('INSERT INTO mel_ai_neuron_budget(day,neurons,calls) VALUES(?,9000,1)').bind(new Date().toISOString().slice(0,10)).run();
    bindLocalPcWorkersAi(env,async()=>{local++;return {ok:true,text:'local'};});
    const adapter=createWorkersAIAdapter({env,modelId:MODEL});
    await assert.rejects(adapter.invoke({input:'Independent review',context:{purpose:'state-of-play-before-development'}}),error=>error.code==='WORKERS_AI_DAILY_NEURON_BUDGET_EXHAUSTED');
    assert.equal(cloud,0);assert.equal(local,0,'no local substitute may impersonate an independent reserved cloud vote');
  }finally{DB.close();}
});


test('a local reply cannot count as a reserved cloud review even if a transport ignores the routing marker',async()=>{
  const adapter=createWorkersAIAdapter({env:{AI:{run:async()=>({response:'looks valid',local:true,model:'pc:qwen3:8b'})}},modelId:MODEL});
  await assert.rejects(adapter.invoke({input:'review independently',context:{purpose:'state-of-play-before-development'}}),{code:'COUNCIL_LOCAL_SUBSTITUTE_REFUSED'});
});
