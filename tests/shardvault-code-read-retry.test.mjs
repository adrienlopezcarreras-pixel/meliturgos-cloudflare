import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {downloadCodeFragmentWithRetry,isTransientCodeReadFailure} from '../src/continuity/shardvault-code-read-retry.js';

test('temporary 429/503/520/transport abort retries succeed with exact returned bytes',async()=>{
  const inputs=['READ_pastebox-anonymous_429','READ_pastegg-public_503','READ_pastemyst-public_520'];
  for(const value of inputs){
    let n=0;const waited=[];
    const result=await downloadCodeFragmentWithRetry(async()=>{
      n++;
      if(n<3)throw new Error(value);
      return Uint8Array.from([0,1,2,3]);
    },{sleep:async ms=>waited.push(ms)});
    assert.equal(n,3);
    assert.deepEqual(waited,[750,1500]);
    assert.deepEqual(Array.from(result),[0,1,2,3]);
  }
  assert.equal(isTransientCodeReadFailure(Object.assign(new Error('network'),{name:'AbortError'})),true);
});

test('permanent 403, 404 and integrity failures are never retried',async()=>{
  for(const value of ['READ_pastebox-anonymous_403','READ_pastegg-public_404','CODE_SHARD_MAC_INVALID','CODE_SHARD_LENGTH_INVALID','READ_pastemyst-public_CONTENT_MISSING']){
    let n=0;
    await assert.rejects(downloadCodeFragmentWithRetry(async()=>{n++;throw new Error(value)},{sleep:async()=>{}}),{message:value});
    assert.equal(n,1,value);
  }
});

test('third transient failure is terminal; no unbounded loops or alternate local source',async()=>{
 let n=0;
 await assert.rejects(downloadCodeFragmentWithRetry(async()=>{n++;throw new Error('READ_pastegg-public_503')},{sleep:async()=>{}}),/READ_pastegg-public_503/);
 assert.equal(n,3);
});

test('only archive reconstruction uses retry wrapper and MAC/hash proofs remain mandatory',()=>{
 const runtime=readFileSync('src/continuity/shardvault-runtime.js','utf8');
 const i=runtime.indexOf('async function reconstructExternalCodeArchive');
 const j=runtime.indexOf('export async function verifyShardVaultCodeReconstruction',i);
 assert.ok(i>0&&j>i);
 const proof=runtime.slice(i,j);
 assert.equal((proof.match(/await downloadCodeFragmentWithRetry\(\(\)=>downloadFragment\(env,e,d\)\)/g)||[]).length,2);
 assert.match(proof,/CODE_SHARD_MAC_INVALID/);
 assert.match(proof,/CODE_REPLICA_HASH_INVALID/);
 assert.match(proof,/CODE_RECONSTRUCTION_HASH_MISMATCH/);
 assert.match(proof,/independent_of_local_archive:true/);
});
