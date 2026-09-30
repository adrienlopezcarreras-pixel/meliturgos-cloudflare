import test from 'node:test';
import assert from 'node:assert/strict';
import { RuntimeProviderAdapter, proveRuntimeProvider } from '../../src/portability/runtime-provider-adapter.js';

function adapter({smokeOk=true,promoteOk=true}={}){
  const calls=[];
  return {
    calls,
    adapter:new RuntimeProviderAdapter({
      id:'runtime.alt',
      provider:'alternate-runtime',
      health:async()=>({ok:true,status:'HEALTHY'}),
      prepare:async input=>{calls.push(['prepare',input]);return{ok:true,plan_id:'p1'};},
      deployCandidate:async input=>{calls.push(['deploy',input]);return{ok:true,candidate_id:'cand-1'};},
      smoke:async input=>{calls.push(['smoke',input]);return smokeOk?{ok:true}:{ok:false,code:'HTTP_500'};},
      promote:async input=>{calls.push(['promote',input]);return{ok:promoteOk};},
      rollback:async input=>{calls.push(['rollback',input]);return{ok:true};},
    }),
  };
}

test('alternate runtime is verified through prepare deploy smoke promote',async()=>{
  const f=adapter();
  const result=await proveRuntimeProvider(f.adapter,{artifact:{ref:'bundle'},sourceSha:'a'.repeat(40)});
  assert.equal(result.ok,true);
  assert.equal(result.status,'RUNTIME_PROVIDER_VERIFIED');
  assert.deepEqual(f.calls.map(x=>x[0]),['prepare','deploy','smoke','promote']);
});

test('failed runtime smoke automatically rolls back candidate deployment',async()=>{
  const f=adapter({smokeOk:false});
  const result=await proveRuntimeProvider(f.adapter,{artifact:{ref:'bundle'},sourceSha:'a'.repeat(40)});
  assert.equal(result.ok,false);
  assert.equal(result.status,'RUNTIME_PROVIDER_ROLLED_BACK');
  assert.equal(result.rollback_ok,true);
  assert.deepEqual(f.calls.map(x=>x[0]),['prepare','deploy','smoke','rollback']);
});

test('failed runtime promotion also rolls back',async()=>{
  const f=adapter({promoteOk:false});
  const result=await proveRuntimeProvider(f.adapter,{artifact:{ref:'bundle'},sourceSha:'a'.repeat(40)});
  assert.equal(result.status,'RUNTIME_PROVIDER_PROMOTION_ROLLED_BACK');
  assert.equal(result.rollback_ok,true);
});
