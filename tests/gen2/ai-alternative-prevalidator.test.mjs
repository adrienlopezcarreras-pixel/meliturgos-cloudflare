import test from 'node:test';
import assert from 'node:assert/strict';
import { createAlternativeRegistry, eligibleAlternatives } from '../../src/portability/prevalidated-alternative-registry.js';
import { prevalidateConfiguredAiAlternatives } from '../../src/portability/ai-alternative-prevalidator.js';

const now=Date.UTC(2026,8,28,18,0,0);

function envWith(descriptor){
  return {
    MEL_ALT_AI_PROVIDERS_JSON:JSON.stringify([descriptor]),
    ALT_AI_TOKEN:'x',
    MEL_DEPLOYED_GIT_SHA:'a'.repeat(40),
  };
}

function zeroCostDescriptor(overrides={}){
  return {
    id:'ai.alt',
    provider:'alternate-ai',
    model:'m1',
    endpoint:'https://alt.example/v1/chat/completions',
    secret_env:'ALT_AI_TOKEN',
    capabilities:['GENERAL'],
    estimated_cost:0,
    cost_provenance:{
      verified:true,
      addedCost:0,
      authorization:{approved:true,policy:'ZERO_EURO',authority:'owner'},
    },
    ...overrides,
  };
}

test('live exact-response smoke promotes a zero-cost alternate AI provider into registry',async()=>{
  const result=await prevalidateConfiguredAiAlternatives({
    env:envWith(zeroCostDescriptor()),
    registry:createAlternativeRegistry([],{now}),
    now,
    fetchImpl:async()=>Response.json({choices:[{message:{content:'MEL_AI_ALT_OK'}}]}),
  });
  assert.equal(result.prevalidated_count,1);
  assert.equal(result.failed_count,0);
  const row=result.registry.layers.ai[0];
  assert.equal(row.prevalidated,true);
  assert.equal(row.cost_mode,'ZERO_EURO_VERIFIED');
  assert.equal(row.added_cost_eur,0);
  assert.equal(row.proof.source_sha,'a'.repeat(40));
  assert.deepEqual(eligibleAlternatives(result.registry,'ai',{maxAddedCostEur:0,now}).map(x=>x.id),['ai.alt']);
});

test('unknown or unverified provider cost is never auto-prevalidated',async()=>{
  const result=await prevalidateConfiguredAiAlternatives({
    env:envWith(zeroCostDescriptor({cost_provenance:{verified:false,addedCost:0,authorization:{approved:true}}})),
    registry:createAlternativeRegistry([],{now}),
    now,
    fetchImpl:async()=>{throw new Error('must not call');},
  });
  assert.equal(result.prevalidated_count,0);
  assert.equal(result.skipped_count,1);
  assert.equal(result.results[0].status,'SKIPPED_COST_NOT_VERIFIED_ZERO');
});

test('wrong live response cannot enter emergency registry',async()=>{
  const result=await prevalidateConfiguredAiAlternatives({
    env:envWith(zeroCostDescriptor()),
    registry:createAlternativeRegistry([],{now}),
    now,
    fetchImpl:async()=>Response.json({choices:[{message:{content:'something else'}}]}),
  });
  assert.equal(result.prevalidated_count,0);
  assert.equal(result.failed_count,1);
  assert.equal(result.registry.layers.ai.length,0);
});

test('provider HTTP failure cannot replace an older known registry state',async()=>{
  const existing=createAlternativeRegistry([{
    id:'backup.alt',
    layer:'backup_restore',
    provider:'drive',
    adapter_id:'drive',
    added_cost_eur:0,
    proof:{
      isolated_test:true,smoke:true,rollback:true,export:true,import:true,activate:true,
      verified_at:new Date(now-1000).toISOString(),
      expires_at:new Date(now+86400000).toISOString(),
      evidence_ref:'ci://backup',
      source_sha:'b'.repeat(40),
    },
  }],{now});
  const result=await prevalidateConfiguredAiAlternatives({
    env:envWith(zeroCostDescriptor()),
    registry:existing,
    now,
    fetchImpl:async()=>new Response('down',{status:503}),
  });
  assert.equal(result.failed_count,1);
  assert.equal(result.registry.layers.backup_restore[0].id,'backup.alt');
});


test('configured low-refusal flag is not trusted without live behavioral proof',async()=>{
  let call=0;
  const result=await prevalidateConfiguredAiAlternatives({
    env:envWith(zeroCostDescriptor({low_refusal:true,policy_profile:'LOW_REFUSAL'})),
    registry:createAlternativeRegistry([],{now}),
    now,
    fetchImpl:async()=>{
      call++;
      if(call===1) return Response.json({choices:[{message:{content:'MEL_AI_ALT_OK'}}]});
      return Response.json({choices:[{message:{content:"I'm unable to help with that"}}]});
    },
  });
  assert.equal(result.prevalidated_count,1);
  assert.equal(result.registry.layers.ai[0].prevalidated,true);
  assert.equal(result.registry.layers.ai[0].low_refusal,false);
  assert.equal(result.results[0].low_refusal,false);
  assert.equal(result.results[0].low_refusal_probe.ok,false);
});

test('live low-refusal proof upgrades an alternate AI provider to low-refusal rescue',async()=>{
  const result=await prevalidateConfiguredAiAlternatives({
    env:envWith(zeroCostDescriptor({low_refusal:true,policy_profile:'LOW_REFUSAL'})),
    registry:createAlternativeRegistry([],{now}),
    now,
    fetchImpl:async()=>Response.json({choices:[{message:{content:'MEL_AI_ALT_OK'}}]}),
  });
  assert.equal(result.prevalidated_count,1);
  assert.equal(result.registry.layers.ai[0].low_refusal,true);
  assert.equal(result.results[0].low_refusal_probe.ok,true);
});


test('Gemini free-tier secret auto-registers an always-on zero-cost low-refusal alternative',async()=>{
  const requests=[];
  const env={
    GEMINI_API_KEY:'gemini-test-secret',
    MEL_DEPLOYED_GIT_SHA:'c'.repeat(40),
  };
  const result=await prevalidateConfiguredAiAlternatives({
    env,
    registry:createAlternativeRegistry([],{now}),
    now,
    fetchImpl:async(url,options={})=>{
      requests.push({url:String(url),headers:options.headers,body:JSON.parse(options.body)});
      return Response.json({
        candidates:[{content:{parts:[{text:'MEL_AI_ALT_OK'}]}}],
      });
    },
  });
  assert.equal(result.prevalidated_count,1);
  const row=result.registry.layers.ai.find(x=>x.id==='gemini:free-tier');
  assert.ok(row);
  assert.equal(row.prevalidated,true);
  assert.equal(row.provider,'google-gemini');
  assert.equal(row.endpoint_class,'always-on-google-gemini-api');
  assert.equal(row.added_cost_eur,0);
  assert.equal(row.low_refusal,true);
  assert.equal(row.proof.source_sha,'c'.repeat(40));
  assert.equal(requests.length,4);
  assert.match(requests[0].url,/gemini-3\.1-flash-lite:generateContent$/);
  assert.equal(requests[0].headers['x-goog-api-key'],'gemini-test-secret');
  assert.ok(Array.isArray(requests[0].body.contents));
  assert.ok(requests[0].body.systemInstruction);
});

test('Gemini API key is never sent as bearer authorization',async()=>{
  const env={GEMINI_API_KEY:'gemini-test-secret',MEL_DEPLOYED_GIT_SHA:'d'.repeat(40)};
  let headers=null;
  await prevalidateConfiguredAiAlternatives({
    env,
    registry:createAlternativeRegistry([],{now}),
    now,
    fetchImpl:async(_url,options={})=>{
      headers=options.headers;
      return Response.json({candidates:[{content:{parts:[{text:'MEL_AI_ALT_OK'}]}}]});
    },
  });
  assert.equal(headers.authorization,undefined);
  assert.equal(headers['x-goog-api-key'],'gemini-test-secret');
});
