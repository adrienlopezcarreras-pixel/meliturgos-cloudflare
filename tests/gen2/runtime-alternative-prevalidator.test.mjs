import test from 'node:test';
import assert from 'node:assert/strict';
import { RuntimeProviderAdapter } from '../../src/portability/runtime-provider-adapter.js';
import { createAlternativeRegistry, eligibleAlternatives } from '../../src/portability/prevalidated-alternative-registry.js';
import { prevalidateRuntimeAlternative } from '../../src/portability/runtime-alternative-prevalidator.js';

const now=Date.UTC(2026,8,28,18,0,0);

function descriptor(overrides={}){
  return {
    id:'runtime.alt',
    provider:'alternate-runtime',
    adapter_id:'runtime.alt.adapter',
    added_cost_eur:0,
    cost_provenance:{
      verified:true,
      addedCost:0,
      authorization:{approved:true,policy:'ZERO_EURO',authority:'owner'},
    },
    ...overrides,
  };
}

function adapter({smoke=true,promote=true}={}){
  return new RuntimeProviderAdapter({
    id:'runtime.alt.adapter',
    provider:'alternate-runtime',
    health:async()=>({ok:true}),
    prepare:async()=>({ok:true,plan_id:'p'}),
    deployCandidate:async()=>({ok:true,candidate_id:'c1'}),
    smoke:async()=>({ok:smoke}),
    promote:async()=>({ok:promote}),
    rollback:async()=>({ok:true}),
  });
}

test('zero-cost live-proven runtime enters emergency registry',async()=>{
  const result=await prevalidateRuntimeAlternative({
    descriptor:descriptor(),
    adapter:adapter(),
    registry:createAlternativeRegistry([],{now}),
    artifact:{ref:'bundle'},
    sourceSha:'a'.repeat(40),
    now,
  });
  assert.equal(result.ok,true);
  assert.equal(result.status,'RUNTIME_ALTERNATIVE_PREVALIDATED');
  assert.equal(result.registry.layers.runtime[0].prevalidated,true);
  assert.deepEqual(
    eligibleAlternatives(result.registry,'runtime',{maxAddedCostEur:0,now}).map(x=>x.id),
    ['runtime.alt'],
  );
});

test('runtime with unverified cost is not executed',async()=>{
  let called=false;
  const a=new RuntimeProviderAdapter({
    id:'r',provider:'p',
    prepare:async()=>{called=true;return{ok:true};},
    deployCandidate:async()=>({ok:true,candidate_id:'c'}),
    smoke:async()=>({ok:true}),
    promote:async()=>({ok:true}),
    rollback:async()=>({ok:true}),
  });
  const result=await prevalidateRuntimeAlternative({
    descriptor:descriptor({cost_provenance:{verified:false,addedCost:0,authorization:{approved:true}}}),
    adapter:a,
    registry:createAlternativeRegistry([],{now}),
    artifact:{ref:'bundle'},
    sourceSha:'a'.repeat(40),
    now,
  });
  assert.equal(result.status,'SKIPPED_COST_NOT_VERIFIED_ZERO');
  assert.equal(called,false);
});

test('failed smoke cannot enter runtime rescue registry',async()=>{
  const result=await prevalidateRuntimeAlternative({
    descriptor:descriptor(),
    adapter:adapter({smoke:false}),
    registry:createAlternativeRegistry([],{now}),
    artifact:{ref:'bundle'},
    sourceSha:'a'.repeat(40),
    now,
  });
  assert.equal(result.ok,false);
  assert.equal(result.status,'LIVE_RUNTIME_PROOF_FAILED');
  assert.equal(result.registry.layers.runtime.length,0);
});

test('failed promotion cannot enter runtime rescue registry',async()=>{
  const result=await prevalidateRuntimeAlternative({
    descriptor:descriptor(),
    adapter:adapter({promote:false}),
    registry:createAlternativeRegistry([],{now}),
    artifact:{ref:'bundle'},
    sourceSha:'a'.repeat(40),
    now,
  });
  assert.equal(result.ok,false);
  assert.equal(result.registry.layers.runtime.length,0);
});
