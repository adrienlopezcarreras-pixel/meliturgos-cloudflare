import test from 'node:test';
import assert from 'node:assert/strict';
import { ObjectStorageAdapter } from '../../src/portability/object-storage-adapter.js';
import { createAlternativeRegistry, eligibleAlternatives } from '../../src/portability/prevalidated-alternative-registry.js';
import {
  prevalidateInfrastructureAlternative,
  INFRASTRUCTURE_PREVALIDATION_LAYERS,
} from '../../src/portability/infrastructure-alternative-prevalidator.js';

const now=Date.UTC(2026,8,28,18,0,0);

function descriptor(overrides={}){
  return {
    id:'storage.alt',
    provider:'alternate-storage',
    adapter_id:'storage.alt.adapter',
    added_cost_eur:0,
    cost_provenance:{
      verified:true,
      addedCost:0,
      authorization:{approved:true,policy:'ZERO_EURO',authority:'owner'},
    },
    ...overrides,
  };
}

function storage(){
  const map=new Map();
  return new ObjectStorageAdapter({
    id:'storage.alt.adapter',
    provider:'alternate-storage',
    health:async()=>({ok:true}),
    put:async({key,bytes})=>{map.set(key,new Uint8Array(bytes));return{ok:true};},
    get:async({key})=>map.has(key)?{ok:true,found:true,bytes:map.get(key)}:{ok:true,found:false,status:'NOT_FOUND'},
    list:async({prefix})=>({ok:true,keys:[...map.keys()].filter(k=>k.startsWith(prefix))}),
    deleteObject:async({key})=>{map.delete(key);return{ok:true};},
  });
}

test('unified prevalidator can promote a live-proven storage alternative',async()=>{
  const result=await prevalidateInfrastructureAlternative({
    layer:'storage',
    descriptor:descriptor(),
    adapter:storage(),
    registry:createAlternativeRegistry([],{now}),
    now,
  });
  assert.equal(result.ok,true);
  assert.equal(result.status,'INFRA_ALTERNATIVE_PREVALIDATED');
  assert.equal(result.registry.layers.storage[0].prevalidated,true);
  assert.deepEqual(
    eligibleAlternatives(result.registry,'storage',{maxAddedCostEur:0,now}).map(x=>x.id),
    ['storage.alt'],
  );
});

test('unified prevalidator refuses unverified cost before touching provider',async()=>{
  let touched=false;
  const a=storage();
  a._health=async()=>{touched=true;return{ok:true};};
  const result=await prevalidateInfrastructureAlternative({
    layer:'storage',
    descriptor:descriptor({cost_provenance:{verified:false,addedCost:0,authorization:{approved:true}}}),
    adapter:a,
    registry:createAlternativeRegistry([],{now}),
    now,
  });
  assert.equal(result.status,'SKIPPED_COST_NOT_VERIFIED_ZERO');
  assert.equal(touched,false);
});

test('supported infrastructure layers cover every non-AI and non-backup sovereignty layer',()=>{
  assert.deepEqual(
    [...INFRASTRUCTURE_PREVALIDATION_LAYERS].sort(),
    ['ci_cd','database','observability','runtime','scheduler','secrets_identity','source_control','storage'].sort(),
  );
});
