import test from 'node:test';
import assert from 'node:assert/strict';
import { createCompanionRuntimeProviderAdapter } from '../../src/portability/companion-runtime-provider-adapter.js';
import { createCompanionSecretStoreAdapter } from '../../src/portability/companion-secret-store-adapter.js';
import { proveRuntimeProvider } from '../../src/portability/runtime-provider-adapter.js';
import { proveSecretStoreAdapter } from '../../src/portability/secret-store-adapter.js';

function runtimeExec(){
  return async({action})=>{
    if(action==='health')return{ok:true,runtime:'node-local'};
    if(action==='prepare')return{ok:true,plan_id:'p1'};
    if(action==='deploy_candidate')return{ok:true,candidate_id:'c1'};
    if(action==='smoke')return{ok:true,passed:true};
    if(action==='promote')return{ok:true,promoted:true,release_id:'r1'};
    if(action==='rollback')return{ok:true,rolled_back:true};
    return{ok:false,code:'UNKNOWN_ACTION'};
  };
}

function secretExec({leak=false}={}){
  const refs=new Map();
  return async({action,payload})=>{
    if(action==='health')return{ok:true,backend:'local-encrypted-vault'};
    if(action==='put_ref'){
      refs.set(payload.ref,{ref:payload.ref,version:1,metadata:payload.metadata});
      return leak?{ok:true,ref:payload.ref,secret_value:'bad'}:{ok:true,ref:payload.ref,version:1};
    }
    if(action==='get_ref')return{ok:true,...refs.get(payload.ref)};
    if(action==='list_refs')return{ok:true,refs:[...refs.values()]};
    if(action==='rotate_ref'){
      const row=refs.get(payload.ref);row.version++;return{ok:true,ref:payload.ref,version:row.version};
    }
    if(action==='delete_ref'){refs.delete(payload.ref);return{ok:true};}
    return{ok:false,code:'UNKNOWN_ACTION'};
  };
}

test('companion runtime satisfies provider-neutral deploy/smoke/promote/rollback proof',async()=>{
  const proof=await proveRuntimeProvider(
    createCompanionRuntimeProviderAdapter({execute:runtimeExec()}),
    {artifact:{ref:'bundle'},sourceSha:'a'.repeat(40)},
  );
  assert.equal(proof.ok,true);
  assert.equal(proof.provider,'local-companion-runtime');
});

test('companion secret vault satisfies metadata-only secret lifecycle proof',async()=>{
  const proof=await proveSecretStoreAdapter(createCompanionSecretStoreAdapter({execute:secretExec()}));
  assert.equal(proof.ok,true);
  assert.equal(proof.provider,'local-companion-secret-vault');
  assert.equal(proof.plaintext_secret_export,false);
});

test('companion secret vault rejects any provider response leaking a secret value',async()=>{
  const adapter=createCompanionSecretStoreAdapter({execute:secretExec({leak:true})});
  const proof=await proveSecretStoreAdapter(adapter);
  assert.equal(proof.ok,false);
  assert.equal(proof.status,'SECRET_STORE_REF_WRITE_FAILED');
});

test('offline companion fails closed for runtime and secrets',async()=>{
  const offline=async()=>({ok:false,code:'DEVICE_OFFLINE'});
  const runtime=await createCompanionRuntimeProviderAdapter({execute:offline}).health();
  const secrets=await createCompanionSecretStoreAdapter({execute:offline}).health();
  assert.equal(runtime.ok,false);
  assert.equal(secrets.ok,false);
  assert.equal(runtime.code,'DEVICE_OFFLINE');
  assert.equal(secrets.code,'DEVICE_OFFLINE');
});
