import test from 'node:test';
import assert from 'node:assert/strict';
import {councilOperationalCatalog,withCouncilOperationalCatalog} from '../src/council/operational-catalog.js';
import {runModelCouncil} from '../src/models/model-council.js';
import {ProviderPool} from '../src/augmentio/provider-pool.js';
import {ZERO_EURO_POLICY} from '../src/augmentio/zero-euro-governor.js';
const row=id=>({id,description:'Real registered operation',enabled:true,health:'HEALTHY',risk:'MEDIUM',permissions:[],input_schema:{type:'object',properties:{goal:{type:'string'}},required:['goal']},token:'PRIVATE_VALUE'});
test('Council sees only live registered operations, never secrets, tests or invented training',()=>{
 const catalog=councilOperationalCatalog({list:()=>[row('work.create'),row('echo'),row('evolution.enqueue')]});
 assert.deepEqual(catalog.operations.map(r=>r.id),['evolution.enqueue','work.create']);
 assert.equal(catalog.lora.training_tool_registered,false);assert.equal(catalog.lora.preparation_is_training,false);
 assert.equal(catalog.operations[0].tested_now,false);assert.equal(JSON.stringify(catalog).includes('PRIVATE_VALUE'),false);
 const qwen=councilOperationalCatalog({list:()=>[]},{MEL_LORA_BASE_MODEL:'Qwen/Qwen2.5-1.5B-Instruct'});
 assert.equal(qwen.lora.runtime_model,null,'never claim a Mistral adapter is usable on Qwen');
});
test('catalogue is bounded and keeps operational entrypoints before secondary descriptors',()=>{
 const catalog=councilOperationalCatalog({list:()=>[...Array.from({length:70},(_,i)=>({...row('work.other'+i),description:'x'.repeat(900)})),row('work.create')]});
 assert.equal(catalog.operations[0].id,'work.create');assert.equal(catalog.truncated,true);assert.ok(JSON.stringify(catalog.operations).length<=10000);
});
test('optional catalogue does not mutate or replace the owner request',()=>{
 const request=[{role:'user',content:'Demande un entraînement'}];const snapshot=JSON.stringify(request);
 const result=withCouncilOperationalCatalog(request,{source:'LIVE_CAPABILITY_BUS'});
 assert.equal(JSON.stringify(request),snapshot);assert.equal(result[0].role,'system');assert.equal(result[1].content,request[0].content);
 assert.equal(withCouncilOperationalCatalog(request,null),request);
});
test('independent critiques and MEL synthesis receive the actual operation catalogue',async()=>{
 const calls=[];
 const pool=new ProviderPool(['a','b'].map(id=>({id,providerId:'test',modelId:id,capabilities:['GENERAL'],estimatedCost:0,enabled:true,healthStatus:'HEALTHY',health:async()=> 'HEALTHY',
  costProvenance:{verified:true,addedCost:0,source:'test',authorization:{approved:true,policy:ZERO_EURO_POLICY,authority:'test',adapter_id:id,provider:'test',model:id}},
  async invoke({input,context}){calls.push({input,context});return {text:'Critique factuelle ; aucune action exécutée.',provenance:{provider:'test',model:id}};}})));
 const catalog=councilOperationalCatalog({list:()=>[row('work.create')]});
 const report=await runModelCouncil({pool,request:{prompt:'Préparer une mission'},operationalCatalog:catalog});
 assert.equal(report.request,'Préparer une mission');assert.ok(calls.length>=3);
 assert.equal(catalog.operations[0].availability,true);
 for(const call of calls)assert.match(JSON.stringify(call.input),/LIVE_CAPABILITY_BUS/);
});
