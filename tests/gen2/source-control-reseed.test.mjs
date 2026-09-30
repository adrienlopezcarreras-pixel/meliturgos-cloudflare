import test from 'node:test';
import assert from 'node:assert/strict';
import { SourceControlAdapter } from '../../src/portability/source-control-adapter.js';
import {
  validateRecoveredSource,
  reseedRecoveredSourceControl,
  sourceControlEmergencyReadiness,
} from '../../src/portability/source-control-reseed.js';

function adapter(){
  const refs=new Map([['main','a'.repeat(40)]]);
  const files=new Map([['a'.repeat(40)+':package.json','{"name":"mel"}']]);
  return new SourceControlAdapter({
    id:'forge.alt',
    provider:'alternate-forge',
    health:async()=>({ok:true}),
    readRef:async({ref})=>({sha:refs.get(ref)||'a'.repeat(40)}),
    readFile:async({ref,path})=>({content:files.get(ref+':'+path)||'x'}),
    createRef:async({ref,sha})=>{refs.set(ref,sha);return{ok:true};},
    writeFile:async({ref,path,content})=>{
      const sha='b'.repeat(40);refs.set(ref,sha);files.set(sha+':'+path,content);return{ok:true,sha};
    },
    compareRefs:async()=>({ok:true,ahead_by:1}),
    updateRef:async({ref,sha})=>{refs.set(ref,sha);return{ok:true};},
  });
}

const reconstruction={
  ok:true,
  status:'CODE_RECONSTRUCTION_VERIFIED',
  git_sha:'a'.repeat(40),
  sha256:'f'.repeat(64),
  reconstructed_bytes:123456,
  replication_mode:'RS_4_OF_7',
  used_endpoints:['e1','e2','e3','e4'],
  independent_of_local_archive:true,
};

test('ShardVault recovered source is accepted only when exact deployed SHA is preserved',()=>{
  const out=validateRecoveredSource({reconstruction,expectedSha:'a'.repeat(40)});
  assert.equal(out.ok,true);
  assert.equal(out.source_sha,'a'.repeat(40));
  assert.equal(out.used_endpoints.length,4);

  assert.throws(
    ()=>validateRecoveredSource({reconstruction,expectedSha:'b'.repeat(40)}),
    error=>error?.code==='SOURCE_RESEED_SHA_MISMATCH',
  );
});

test('new forge can be reseeded and then proven independently of GitHub',async()=>{
  const target=adapter();
  const result=await reseedRecoveredSourceControl({
    reconstruction,
    expectedSha:'a'.repeat(40),
    targetAdapter:target,
    materializeRecoveredTree:async()=>({ok:true,ref:'tree://recovered'}),
    importRecoveredTree:async()=>({ok:true,commit_sha:'c'.repeat(40)}),
    targetBranch:'main',
  });
  assert.equal(result.ok,true);
  assert.equal(result.status,'SOURCE_CONTROL_RESEEDED_AND_VERIFIED');
  assert.equal(result.target_provider,'alternate-forge');
  assert.equal(result.original_github_required,false);
  assert.equal(result.target_proof.ok,true);
});

test('emergency readiness requires both reconstructable source and a prevalidated target forge',()=>{
  const none=sourceControlEmergencyReadiness({
    reconstruction,expectedSha:'a'.repeat(40),prevalidatedTargets:[],
  });
  assert.equal(none.ok,false);
  assert.equal(none.status,'SOURCE_CONTROL_TARGET_MISSING');

  const ready=sourceControlEmergencyReadiness({
    reconstruction,
    expectedSha:'a'.repeat(40),
    prevalidatedTargets:[{id:'forge.alt',provider:'alternate-forge',layer:'source_control',prevalidated:true}],
  });
  assert.equal(ready.ok,true);
  assert.equal(ready.status,'SOURCE_CONTROL_RECOVERY_READY');
  assert.equal(ready.github_required,false);
});

test('reseed refuses a recovery that still depends on local archive',()=>{
  assert.throws(
    ()=>validateRecoveredSource({
      reconstruction:{...reconstruction,independent_of_local_archive:false},
      expectedSha:'a'.repeat(40),
    }),
    error=>error?.code==='SOURCE_RESEED_INDEPENDENCE_REQUIRED',
  );
});
