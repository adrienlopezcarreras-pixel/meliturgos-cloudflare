import test from 'node:test';
import assert from 'node:assert/strict';
import { CiProviderAdapter, proveCiProviderAdapter } from '../../src/portability/ci-provider-adapter.js';

function adapter({sha='a'.repeat(40)}={}){
  return new CiProviderAdapter({
    id:'ci.alt',
    provider:'alternate-ci',
    health:async()=>({ok:true}),
    dispatch:async()=>({ok:true,run_id:'run-1'}),
    getRun:async()=>({ok:true,run_id:'run-1',source_sha:sha,status:'SUCCEEDED'}),
    getArtifacts:async()=>({ok:true,artifacts:[{id:'proof'}]}),
    cancelRun:async()=>({ok:true}),
  });
}

test('provider-neutral CI proof covers dispatch read artifacts and cancel',async()=>{
  const result=await proveCiProviderAdapter(adapter(),{sourceSha:'a'.repeat(40)});
  assert.equal(result.ok,true);
  assert.equal(result.status,'CI_PROVIDER_ADAPTER_VERIFIED');
  assert.equal(result.dispatch,true);
  assert.equal(result.artifact_read,true);
});

test('CI proof rejects run for another source SHA',async()=>{
  const result=await proveCiProviderAdapter(adapter({sha:'b'.repeat(40)}),{sourceSha:'a'.repeat(40)});
  assert.equal(result.ok,false);
  assert.equal(result.status,'CI_PROVIDER_SHA_MISMATCH');
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
