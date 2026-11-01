import test from 'node:test';
import assert from 'node:assert/strict';
import {assessRoadmapResponse,measureRoadmapProduction} from '../scripts/prove-production-roadmap-176-readonly.mjs';
const sha='a'.repeat(40);
const response=()=>{
 const ids=Array.from({length:176},(_,i)=>'POINT-'+i);
 const items=Object.fromEntries(ids.map((id,i)=>[id,{truth:i===0?'VERIFIED_LIVE':'UNPROVEN'}]));
 return {ok:true,phases:[{items:ids.map(id=>({id}))}],truth:{available:true,total:176,items}};
};
test('returns only counts and IDs, not private proof payloads',()=>{
 const result=assessRoadmapResponse(response(),sha);
 assert.equal(result.ok,true);
 assert.equal(result.verified_live,1);
 assert.equal(result.remaining.length,175);
 assert.equal(result.coverage_percent,0.6);
 assert.equal(result.deployed_sha,sha);
 assert.ok(!JSON.stringify(result).includes('proofs'));
});
test('fails closed for missing D1, omitted item or inconsistent counts',()=>{
 let body=response();body.truth.available=false;
 assert.equal(assessRoadmapResponse(body,sha).ok,false);
 body=response();delete body.truth.items['POINT-1'];
 assert.equal(assessRoadmapResponse(body,sha).ok,false);
 body=response();body.truth.total=175;
 assert.equal(assessRoadmapResponse(body,sha).ok,false);
});
test('probe performs exactly three GET requests and checks SHA both ends',async()=>{
 const calls=[];
 const fetchImpl=async(url,opts)=>{calls.push({url,opts});return {status:200,json:async()=>url.endsWith('self-check')?{ok:true,exact_deployment_identity_known:true,deployed_sha:sha}:response()};};
 const result=await measureRoadmapProduction({token:'proof',expectedSha:sha,fetchImpl});
 assert.equal(result.ok,true);
 assert.equal(calls.length,3);
 assert.ok(calls.every(c=>c.opts.method==='GET'));
 assert.ok(calls[1].url.endsWith('/api/gen2/roadmap'));
});
