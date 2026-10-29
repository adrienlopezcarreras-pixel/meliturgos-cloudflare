import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchFounderMissionTestEvidence } from '../src/evolution/founder-mission-test-evidence.js';
const SHA='a'.repeat(40);
const request={repository:'owner/repo',candidateSha:SHA,runId:123};
const reply=value=>new Response(JSON.stringify(value),{status:200,headers:{'content-type':'application/json'}});
test('GitHub proof retrieval rejects unrelated SHA before artifact listing',async()=>{
 const calls=[];
 const out=await fetchFounderMissionTestEvidence({...request,fetchImpl:async url=>{
   calls.push(url);
   return reply({id:123,name:'full-candidate-ci',head_sha:'b'.repeat(40),status:'completed',conclusion:'success'});
 }});
 assert.equal(out.code,'MISSION_TEST_RUN_MISMATCH');
 assert.equal(calls.length,1);
});
test('GitHub artifact listing cannot be mistaken for verified test contents',async()=>{
 const out=await fetchFounderMissionTestEvidence({...request,fetchImpl:async url=>
   reply(url.includes('/artifacts?')?{artifacts:[{id:456,name:'founder-mission-test-evidence',expired:false}]}:
     {id:123,name:'full-candidate-ci',head_sha:SHA,status:'completed',conclusion:'success'})});
 assert.equal(out.code,'MISSION_TEST_ARTIFACT_ZIP_READER_REQUIRED');
 assert.equal(out.ok,false);
});
