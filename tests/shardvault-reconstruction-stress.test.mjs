import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { __shardvaultTest } from '../src/continuity/shardvault-runtime.js';

function makeData(k,size,seed){
  return Array.from({length:k},(_,shard)=>{
    const out=new Uint8Array(size);
    let x=(seed+1)*(shard+17)>>>0;
    for(let i=0;i<size;i++){
      x=(1664525*x+1013904223)>>>0;
      out[i]=(x>>>16)&255;
    }
    return out;
  });
}

function combinations(values,count,start=0,prefix=[],out=[]){
  if(prefix.length===count){out.push(prefix.slice());return out;}
  for(let i=start;i<values.length;i++)combinations(values,count,i+1,[...prefix,values[i]],out);
  return out;
}

test('ShardVault RS reconstruction survives every 3-of-7 loss pattern', () => {
  const source=makeData(4,4096,42);
  const encoded=__shardvaultTest.encode(source,7);
  const lossPatterns=combinations([0,1,2,3,4,5,6],3);
  assert.equal(lossPatterns.length,35);
  for(const missing of lossPatterns){
    const available=encoded.map((value,index)=>missing.includes(index)?null:value);
    const rebuilt=__shardvaultTest.decode(available,4,7,4096);
    for(let i=0;i<encoded.length;i++)assert.deepEqual(rebuilt[i],encoded[i],`losses=${missing.join(',')} shard=${i}`);
  }
});

test('ShardVault reconstruction remains exact across repeated payload sizes and losses', () => {
  const sizes=[257,1024,4096,8192];
  for(let round=0;round<48;round++){
    const size=sizes[round%sizes.length];
    const source=makeData(4,size,1000+round);
    const encoded=__shardvaultTest.encode(source,7);
    const missing=[round%7,(round+2)%7,(round+5)%7].filter((v,i,a)=>a.indexOf(v)===i).slice(0,3);
    const available=encoded.map((value,index)=>missing.includes(index)?null:value);
    const rebuilt=__shardvaultTest.decode(available,4,7,size);
    assert.equal(rebuilt.length,7);
    for(let i=0;i<7;i++)assert.equal(__shardvaultTest.byteArraysEqual(rebuilt[i],encoded[i]),true,`round=${round} shard=${i}`);
  }
});

test('external code target assignment withstands repeated endpoint failures without duplicate targets', async () => {
  const items=Array.from({length:7},(_,i)=>new Uint8Array([i,255-i]));
  for(let round=0;round<40;round++){
    const candidates=Array.from({length:14},(_,i)=>({
      id:`stress-${round}-${i}`,
      operatorDomain:`op-${i}.test`,
      providerId:`provider-${i}`,
      expectedRetentionDays:365,
    }));
    const failed=new Set([round%14,(round+3)%14,(round+8)%14]);
    const result=await __shardvaultTest.assignDistinctExternalTargets(items,candidates,async(index,endpoint)=>{
      const n=Number(endpoint.id.split('-').at(-1));
      if(failed.has(n))throw new Error('STRESS_SIMULATED_TARGET_FAILURE');
      return {index,endpointId:endpoint.id};
    });
    assert.equal(result.ok,true,`round ${round}`);
    const ids=result.assignments.map(x=>x.endpointId);
    assert.equal(new Set(ids).size,7,`round ${round} must use seven distinct endpoints`);
    assert.equal(result.pending_indices.length,0);
  }
});

test('ShardVault UI and API expose an explicit code reconstruction proof', async () => {
  const [page,runtime]=await Promise.all([
    readFile(new URL('../src/pages/shardvault-status.js',import.meta.url),'utf8'),
    readFile(new URL('../src/continuity/shardvault-runtime.js',import.meta.url),'utf8'),
  ]);
  assert.match(page,/id="reconstructCode"/);
  assert.match(page,/\/api\/gen2\/shardvault\/code-reconstruct/);
  assert.match(page,/simulate_missing:\[0,2,5\]/);
  assert.match(runtime,/CODE_RECONSTRUCTION_VERIFIED/);
  assert.match(runtime,/independent_of_local_archive:true/);
  assert.match(runtime,/CODE_RECONSTRUCTION_HASH_MISMATCH/);
  assert.match(runtime,/CODE_RECONSTRUCTION_SHARDS_INSUFFICIENT/);
});


test('external code sync is resumable and bounded to one verified RS shard per request', async () => {
  const [runtime,workflow]=await Promise.all([
    readFile(new URL('../src/continuity/shardvault-runtime.js',import.meta.url),'utf8'),
    readFile(new URL('../.github/workflows/deploy-candidate-preview.yml',import.meta.url),'utf8'),
  ]);
  assert.match(runtime,/syncStateKey:'shardvault\/code-sync-state\//);
  assert.match(runtime,/syncShardPrefix:'shardvault\/code-sync-shards\//);
  assert.match(runtime,/replicationMode:'RS_4_OF_7'/);
  assert.match(runtime,/next_action:status==='COPIED'\?null:'CALL_CODE_SYNC_AGAIN'/);
  assert.match(runtime,/const i=descriptors\.length,tempKey=state\.temp_shard_keys\?\.\[i\]/);
  assert.match(runtime,/state\.shards\.push\(descriptor\)/);
  assert.match(runtime,/withCodeReplicaDeadline/);
  assert.match(runtime,/CODE_FRAGMENT_DEADLINE_EXCEEDED/);
  assert.match(runtime,/CODE_FRAGMENT_ROUNDTRIP_MISMATCH/);
  assert.match(runtime,/report\.qualified\|\|report\.selected/);
  assert.match(runtime,/report\.eligible\|\|report\.qualified\|\|report\.selected/);
  assert.match(runtime,/readCodeCandidateEndpoints/);
  assert.match(runtime,/rememberValidatedExternalEndpoints\(env,\[e\]\)/);
  assert.match(runtime,/NO_UNTRIED_VALIDATED_CODE_TARGETS/);
  assert.doesNotMatch(runtime,/state\.failed_endpoint_ids=\[\]/);
  assert.doesNotMatch(runtime,/assignDistinctExternalTargets\(replicas,candidates/);
  assert.match(workflow,/for attempt in \$\(seq 1 32\)/);
  assert.match(workflow,/COPYING\|RETRY_TARGETS/);
  assert.match(workflow,/000\|502\|503\|504/);
  assert.match(workflow,/durable state will be resumed/);
  assert.match(workflow,/SYNC_STATUS.*COPIED/);
});
