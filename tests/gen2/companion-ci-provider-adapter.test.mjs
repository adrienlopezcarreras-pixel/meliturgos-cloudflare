import test from 'node:test';
import assert from 'node:assert/strict';
import { createCompanionCiProviderAdapter } from '../../src/portability/companion-ci-provider-adapter.js';
import { proveCiProviderAdapter } from '../../src/portability/ci-provider-adapter.js';

function executor(){
  return async({action,payload})=>{
    if(action==='health')return{ok:true,node_version:'22.20.0'};
    if(action==='dispatch')return{ok:true,run_id:'local-run-1'};
    if(action==='get_run')return{ok:true,run_id:payload.run_id,source_sha:'a'.repeat(40),status:'SUCCEEDED'};
    if(action==='get_artifacts')return{ok:true,artifacts:[{id:'proof',path:'proof.json'}]};
    if(action==='cancel_run')return{ok:true};
    return{ok:false,code:'UNKNOWN_ACTION'};
  };
}

test('companion CI adapter satisfies CI provider proof contract',async()=>{
  const adapter=createCompanionCiProviderAdapter({execute:executor()});
  const proof=await proveCiProviderAdapter(adapter,{sourceSha:'a'.repeat(40)});
  assert.equal(proof.ok,true);
  assert.equal(proof.provider,'local-companion-ci');
  assert.equal(proof.dispatch,true);
  assert.equal(proof.artifact_read,true);
});

test('companion CI adapter fails closed when local device is offline',async()=>{
  const adapter=createCompanionCiProviderAdapter({
    execute:async()=>({ok:false,code:'DEVICE_OFFLINE'}),
  });
  const health=await adapter.health();
  assert.equal(health.ok,false);
  assert.equal(health.status,'UNAVAILABLE');
  assert.equal(health.code,'DEVICE_OFFLINE');
});


test('CI proof rejects a run that did not finish successfully',async()=>{
  const a=new CiProviderAdapter({
    id:'ci.alt',
    provider:'alternate-ci',
    health:async()=>({ok:true}),
    dispatch:async()=>({ok:true,run_id:'run-2'}),
    getRun:async()=>({ok:true,run_id:'run-2',source_sha:'a'.repeat(40),status:'FAILED'}),
    getArtifacts:async()=>({ok:true,artifacts:[]}),
    cancelRun:async()=>({ok:true}),
  });
  const result=await proveCiProviderAdapter(a,{sourceSha:'a'.repeat(40)});
  assert.equal(result.ok,false);
  assert.equal(result.status,'CI_PROVIDER_PROOF_RUN_NOT_SUCCESSFUL');
});
