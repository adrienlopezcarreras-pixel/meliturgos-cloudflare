import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchOpenTaskCandidates, normalizePublicTask } from '../../scripts/revenue/taskmarket-scan.mjs';
const now = Date.parse('2026-10-16T12:00:00.000Z');
const task = { id:'0x123', status:'open', description:'Transform a public JSON dataset into a normalized CSV.', reward:'1000000', platformFeeBps:750, mode:'bounty', stakeRequired:false, tags:['data','json'], expiryTime:'2026-10-17T12:00:00.000Z', submissionCount:0, claimedBy:null };
test('normalizes open task records and preserves explicit stake/claim state',()=>{
  const x=normalizePublicTask(task,now);
  assert.equal(x.id,'0x123');
  assert.equal(x.rewardUsdcBaseUnits,'1000000');
  assert.equal(x.stakeRequired,false);
  assert.equal(x.claimedBy,null);
  assert.deepEqual(x.tags,['data','json']);
});
test('unknown stake or claim state remains unknown and cannot be inferred as safe',()=>{
  const unknown = { ...task };\n  delete unknown.stakeRequired;\n  delete unknown.claimedBy;\n  const x=normalizePublicTask(unknown,now);
  assert.equal(x.stakeRequired,undefined);
  assert.equal(x.claimedBy,undefined);
});
test('drops closed, expired, malformed or zero-reward tasks',()=>{
  assert.equal(normalizePublicTask({...task,status:'completed'},now),null);
  assert.equal(normalizePublicTask({...task,expiryTime:'2026-10-15T12:00:00Z'},now),null);
  assert.equal(normalizePublicTask({...task,reward:'0'},now),null);
  assert.equal(normalizePublicTask({...task,reward:'1.0'},now),null);
});
test('performs read-only GET and returns candidate envelope',async()=>{
  let seen;
  const result=await fetchOpenTaskCandidates({fetchImpl:async(url,opts)=>{seen={url:String(url),opts};return {ok:true,status:200,json:async()=>({tasks:[task,{...task,id:'expired',expiryTime:'2026-10-15T00:00:00Z'}],hasMore:true,nextCursor:'cursor'})};},baseUrl:'https://example.test/',limit:25,nowMs:now});
  assert.equal(seen.opts.method,'GET');
  assert.equal(new URL(seen.url).searchParams.get('status'),'open');
  assert.equal(result.candidateCount,1);
  assert.equal(result.mode,'READ_ONLY_DISCOVERY');
  assert.equal(result.hasMore,true);
});
test('fails closed on bad API responses',async()=>{
  await assert.rejects(fetchOpenTaskCandidates({fetchImpl:async()=>({ok:false,status:429}),baseUrl:'https://example.test'}),/TASKMARKET_LIST_FAILED:429/);
  await assert.rejects(fetchOpenTaskCandidates({fetchImpl:async()=>({ok:true,status:200,json:async()=>({bad:true})}),baseUrl:'https://example.test'}),/TASKMARKET_RESPONSE_INVALID/);
});
test('caps request size',async()=>{await assert.rejects(fetchOpenTaskCandidates({limit:1000}),/LIMIT_OUT_OF_RANGE/);});
