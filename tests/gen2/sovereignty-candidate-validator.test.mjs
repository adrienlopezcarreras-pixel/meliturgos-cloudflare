import test from 'node:test';
import assert from 'node:assert/strict';
import { validateSovereigntyCandidates } from '../../src/portability/sovereignty-candidate-validator.js';
import { createAlternativeRegistry } from '../../src/portability/prevalidated-alternative-registry.js';
import { ObjectStorageAdapter } from '../../src/portability/object-storage-adapter.js';

function stores(){
  const candidates=[{layer:'storage',id:'storage.alt',status:'UNVERIFIED'}];
  let registry=createAlternativeRegistry([]);
  return {
    candidateStore:{
      async list({status}){return candidates.filter(x=>x.status===status);},
      async setStatus({layer,id,status,metadata}){const row=candidates.find(x=>x.layer===layer&&x.id===id);row.status=status;row.metadata=metadata;return{ok:true};},
    },
    registryStore:{
      async load(){return registry;},
      async save(next){registry=next;return{ok:true};},
      get registry(){return registry;},
      candidates,
    },
  };
}

function storageAdapter(){
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

test('candidate lifecycle moves UNVERIFIED -> TESTING -> PREVALIDATED after real proof',async()=>{
  const s=stores();
  const result=await validateSovereigntyCandidates({
    candidateStore:s.candidateStore,
    registryStore:s.registryStore,
    now:Date.UTC(2026,8,28,18,0,0),
    resolveCandidate:async()=>({
      descriptor:{
        id:'storage.alt',
        provider:'alternate-storage',
        adapter_id:'storage.alt.adapter',
        added_cost_eur:0,
        cost_provenance:{
          verified:true,
          addedCost:0,
          authorization:{approved:true,policy:'ZERO_EURO',authority:'owner'},
        },
      },
      adapter:storageAdapter(),
    }),
  });
  assert.equal(result.prevalidated,1);
  assert.equal(s.registryStore.candidates[0].status,'PREVALIDATED');
  assert.equal(s.registryStore.registry.layers.storage[0].prevalidated,true);
});

test('candidate without an available adapter becomes BLOCKED, never PREVALIDATED',async()=>{
  const s=stores();
  const result=await validateSovereigntyCandidates({
    candidateStore:s.candidateStore,
    registryStore:s.registryStore,
    resolveCandidate:async()=>({descriptor:null,adapter:null}),
  });
  assert.equal(result.blocked,1);
  assert.equal(s.registryStore.candidates[0].status,'BLOCKED');
  assert.equal(s.registryStore.registry.layers.storage.length,0);
});

test('resolver failure is isolated and recorded as BLOCKED',async()=>{
  const s=stores();
  const result=await validateSovereigntyCandidates({
    candidateStore:s.candidateStore,
    registryStore:s.registryStore,
    resolveCandidate:async()=>{throw Object.assign(new Error('missing credential'),{code:'CREDENTIAL_REQUIRED'});},
  });
  assert.equal(result.blocked,1);
  assert.equal(s.registryStore.candidates[0].metadata.reason,'RESOLUTION_FAILED');
});


test('missing credential blocks before provider proof and exposes only reference name',async()=>{
  const s=stores();
  let touched=false;
  const result=await validateSovereigntyCandidates({
    candidateStore:s.candidateStore,
    registryStore:s.registryStore,
    env:{},
    resolveCandidate:async()=>({
      descriptor:{
        id:'storage.alt',
        provider:'alternate-storage',
        adapter_id:'storage.alt.adapter',
        credential_ref:'ALT_STORAGE_TOKEN',
        added_cost_eur:0,
        cost_provenance:{
          verified:true,
          addedCost:0,
          authorization:{approved:true,policy:'ZERO_EURO',authority:'owner'},
        },
      },
      adapter:new ObjectStorageAdapter({
        id:'storage.alt.adapter',
        provider:'alternate-storage',
        health:async()=>{touched=true;return{ok:true};},
        put:async()=>({ok:true}),
        get:async()=>({ok:true,found:false,status:'NOT_FOUND'}),
        list:async()=>({ok:true,keys:[]}),
        deleteObject:async()=>({ok:true}),
      }),
    }),
  });
  assert.equal(result.blocked,1);
  assert.equal(touched,false);
  assert.equal(s.registryStore.candidates[0].status,'BLOCKED');
  assert.equal(s.registryStore.candidates[0].metadata.reason,'CREDENTIAL_REQUIRED');
  assert.deepEqual(s.registryStore.candidates[0].metadata.missing_secrets,['ALT_STORAGE_TOKEN']);
  assert.equal(JSON.stringify(s.registryStore.candidates[0].metadata).includes('secret-value'),false);
});
