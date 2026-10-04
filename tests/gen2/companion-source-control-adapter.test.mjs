import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createCompanionSourceControlAdapter } from '../../src/portability/companion-source-control-adapter.js';
import { proveSourceControlAdapter } from '../../src/portability/source-control-adapter.js';

function executor(){
  const refs=new Map([['main','a'.repeat(40)]]);
  const files=new Map([['a'.repeat(40)+':README.md','hello']]);
  return async({action,payload})=>{
    if(action==='health')return{ok:true,git_version:'2.46.0'};
    if(action==='read_ref')return{ok:true,sha:refs.get(payload.ref)||'a'.repeat(40)};
    if(action==='read_file')return{ok:true,content:files.get((refs.get(payload.ref)||payload.ref)+':'+payload.path)||'x'};
    if(action==='create_ref'){refs.set(payload.ref,payload.sha);return{ok:true};}
    if(action==='update_ref'){refs.set(payload.ref,payload.sha);return{ok:true};}
    if(action==='write_file'){
      const sha='b'.repeat(40);
      refs.set(payload.ref,sha);
      files.set(sha+':'+payload.path,payload.content);
      return{ok:true,sha};
    }
    if(action==='compare_refs')return{ok:true,ahead_by:1,behind_by:0};
    return{ok:false,code:'UNKNOWN_ACTION'};
  };
}

test('companion Git adapter satisfies source-control proof contract',async()=>{
  const adapter=createCompanionSourceControlAdapter({execute:executor()});
  const proof=await proveSourceControlAdapter(adapter,{scratchPrefix:'mel-local-proof'});
  assert.equal(proof.ok,true);
  assert.equal(proof.provider,'local-companion-git');
});

test('companion Git adapter reports offline executor as unavailable',async()=>{
  const adapter=createCompanionSourceControlAdapter({
    execute:async()=>({ok:false,code:'DEVICE_OFFLINE'}),
  });
  const health=await adapter.health();
  assert.equal(health.ok,false);
  assert.equal(health.status,'UNAVAILABLE');
  assert.equal(health.code,'DEVICE_OFFLINE');
});

test('source-control prevalidation revalidates and scopes the exact local Git candidate',async()=>{
  const source=await readFile(new URL('../../src/portability/companion-source-control-prevalidation-runtime.js',import.meta.url),'utf8');
  assert.match(source,/scopeSovereigntyCandidateStore/);
  assert.match(source,/keys:\['source_control::companion-local-git'\]/);
  assert.match(source,/id:'companion-local-git',[\s\S]*status:'UNVERIFIED'/);
  assert.match(source,/candidateStore:scopedCandidateStore/);
});

