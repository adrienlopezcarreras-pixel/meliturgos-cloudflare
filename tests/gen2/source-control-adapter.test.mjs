import test from 'node:test';
import assert from 'node:assert/strict';
import { SourceControlAdapter, proveSourceControlAdapter } from '../../src/portability/source-control-adapter.js';

function fakeAdapter(){
  const refs=new Map([['main','a'.repeat(40)]]);
  const files=new Map([['a'.repeat(40)+':package.json','{"name":"mel"}']]);
  return new SourceControlAdapter({
    id:'git-alt',
    provider:'generic-git',
    health:async()=>({ok:true,status:'HEALTHY'}),
    readRef:async({ref})=>({sha:refs.get(ref)}),
    readFile:async({ref,path})=>({content:files.get(ref+':'+path)||'x'}),
    createRef:async({ref,sha})=>{refs.set(ref,sha);return {ok:true};},
    writeFile:async({ref,path,content})=>{
      const sha='b'.repeat(40);
      refs.set(ref,sha);
      files.set(sha+':'+path,content);
      return {ok:true,sha};
    },
    compareRefs:async({base,head})=>({ok:base!==head,ahead_by:1}),
    updateRef:async({ref,sha})=>{refs.set(ref,sha);return {ok:true};},
  });
}

test('provider-neutral source-control proof covers read write compare and rollback',async()=>{
  const proof=await proveSourceControlAdapter(fakeAdapter());
  assert.equal(proof.ok,true);
  assert.equal(proof.status,'SOURCE_CONTROL_ADAPTER_VERIFIED');
  assert.equal(proof.provider,'generic-git');
  assert.equal(proof.read,true);
  assert.equal(proof.write,true);
  assert.equal(proof.compare,true);
  assert.equal(proof.rollback,true);
});

test('source-control adapter fails closed when a required operation is missing',()=>{
  assert.throws(()=>new SourceControlAdapter({
    id:'broken',provider:'x',
    readRef:async()=>({}),
    readFile:async()=>({}),
    writeFile:async()=>({}),
    createRef:async()=>({}),
    updateRef:async()=>({}),
  }),error=>error?.code==='SOURCE_CONTROL_COMPARE_REFS_REQUIRED');
});

test('source-control proof rejects invalid primary SHA',async()=>{
  const adapter=fakeAdapter();
  adapter._readRef=async()=>({sha:'not-a-sha'});
  const proof=await proveSourceControlAdapter(adapter);
  assert.equal(proof.ok,false);
  assert.equal(proof.status,'SOURCE_CONTROL_MAIN_SHA_INVALID');
});
