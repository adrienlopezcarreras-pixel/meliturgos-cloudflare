import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchFounderMissionTestEvidence } from '../src/evolution/founder-mission-test-evidence.js';
import { zipOne } from './helpers/founder-zip-fixture.mjs';
const SHA='a'.repeat(40);
const request={repository:'owner/repo',candidateSha:SHA,runId:123};
const reply=value=>new Response(JSON.stringify(value),{status:200,headers:{'content-type':'application/json'}});
test('GitHub proof retrieval rejects unrelated SHA before artifact listing',async()=>{
 const calls=[];
 const out=await fetchFounderMissionTestEvidence({...request,fetchImpl:async url=>{
   calls.push(url);
   return reply({id:123,name:'full-candidate-ci',head_branch:'candidate/mel-clean-autonomy',head_sha:'b'.repeat(40),status:'completed',conclusion:'success'});
 }});
 assert.equal(out.code,'MISSION_TEST_RUN_MISMATCH');
 assert.equal(calls.length,1);
});
test('GitHub artifact listing cannot be mistaken for verified test contents',async()=>{
 const out=await fetchFounderMissionTestEvidence({...request,fetchImpl:async url=>
   reply(url.includes('/artifacts?')?{artifacts:[{id:456,name:'founder-mission-test-evidence',expired:false,workflow_run:{id:123,head_sha:SHA}}]}:
     {id:123,name:'full-candidate-ci',head_branch:'candidate/mel-clean-autonomy',head_sha:SHA,status:'completed',conclusion:'success'})});
 assert.equal(out.code,'MISSION_TEST_ARCHIVE_REDIRECT_INVALID');
 assert.equal(out.ok,false);
});


test('wrong candidate branch is refused before listing artifacts', async () => {
  const calls=[];
  const out=await fetchFounderMissionTestEvidence({...request,fetchImpl:async url=>{
    calls.push(url);
    return reply({id:123,name:'full-candidate-ci',head_branch:'main',head_sha:SHA,status:'completed',conclusion:'success'});
  }});
  assert.equal(out.code,'MISSION_TEST_RUN_MISMATCH');
  assert.equal(calls.length,1);
});
test('artifact belonging to another run is rejected even if its name matches', async () => {
  const out=await fetchFounderMissionTestEvidence({...request,fetchImpl:async url=>
    reply(url.includes('/artifacts?')?{artifacts:[{id:456,name:'founder-mission-test-evidence',expired:false,workflow_run:{id:999,head_sha:SHA}}]}:
      {id:123,name:'full-candidate-ci',head_branch:'candidate/mel-clean-autonomy',head_sha:SHA,status:'completed',conclusion:'success'})});
  assert.equal(out.code,'MISSION_TEST_ARTIFACT_MISSING_OR_AMBIGUOUS');
});


test('signed archive redirect refuses an untrusted host before downloading', async () => {
  const calls=[];
  const out=await fetchFounderMissionTestEvidence({...request,fetchImpl:async url=>{
    calls.push(String(url));
    if (String(url).endsWith('/zip')) return new Response(null,{status:302,headers:{location:'https://attacker.example/receipt.zip'}});
    return reply(String(url).includes('/artifacts?')
      ? {artifacts:[{id:456,name:'founder-mission-test-evidence',expired:false,workflow_run:{id:123,head_sha:SHA}}]}
      : {id:123,name:'full-candidate-ci',head_branch:'candidate/mel-clean-autonomy',head_sha:SHA,status:'completed',conclusion:'success'});
  }});
  assert.equal(out.code,'MISSION_TEST_ARCHIVE_HOST_INVALID');
  assert.equal(calls.length,3,'must never contact untrusted redirect destination');
});


test('GitHub Actions Azure storage redirect reaches downloader, not a host refusal', async () => {
  const out=await fetchFounderMissionTestEvidence({...request,fetchImpl:async url=>{
    const address=String(url);
    if (address.endsWith('/zip')) return new Response(null,{status:302,headers:{location:'https://productionresultssa0.blob.core.windows.net/actions/receipt.zip'}});
    if (address.startsWith('https://productionresultssa0.blob.core.windows.net/'))
      return new Response(null,{status:503});
    return reply(address.includes('/artifacts?')
      ? {artifacts:[{id:456,name:'founder-mission-test-evidence',expired:false,workflow_run:{id:123,head_sha:SHA}}]}
      : {id:123,name:'full-candidate-ci',head_branch:'candidate/mel-clean-autonomy',head_sha:SHA,status:'completed',conclusion:'success'});
  }});
  assert.equal(out.code,'MISSION_TEST_ARCHIVE_DOWNLOAD_FAILED');
});


test('signed storage redirect is not followed a second time', async () => {
  const calls=[];
  const out=await fetchFounderMissionTestEvidence({...request,fetchImpl:async (url,opts)=>{
    const address=String(url); calls.push({address,mode:opts?.redirect});
    if (address.endsWith('/zip')) return new Response(null,{status:302,headers:{location:'https://productionresultssa0.blob.core.windows.net/actions/receipt.zip'}});
    if (address.startsWith('https://productionresultssa0.blob.core.windows.net/'))
      return new Response(null,{status:302,headers:{location:'https://attacker.example/steal'}});
    return reply(address.includes('/artifacts?')
      ? {artifacts:[{id:456,name:'founder-mission-test-evidence',expired:false,workflow_run:{id:123,head_sha:SHA}}]}
      : {id:123,name:'full-candidate-ci',head_branch:'candidate/mel-clean-autonomy',head_sha:SHA,status:'completed',conclusion:'success'});
  }});
  assert.equal(out.code,'MISSION_TEST_ARCHIVE_DOWNLOAD_FAILED');
  assert.equal(calls.length,4);
  assert.equal(calls[3].mode,'manual');
});


test('full authenticated run artifact download validates and returns proof digest', async () => {
  const names=[
    'a completed connected read replays its archived response without any model, provider or archive duplicate',
    'a partial turn and another conversation cannot be mistaken for a completed read receipt',
    'a completed connected read lookup failure stops before models and providers',
    'Gmail missing authorization does not inherit the last Google Tasks token error',
    'missing Calendar grant reports a typed auth diagnostic without network calls',
    'missing Drive grant reports a typed auth diagnostic without network calls',
    'a completed connected tool response renders human text instead of raw tool-call JSON',
  ];
  const receipt={schema:'MEL_FOUNDER_MISSION_TEST_EVIDENCE_V1',source:'full-candidate-ci/full-suite',
    candidate_sha:SHA,github_run_id:123,github_run_attempt:1,log_sha256:'b'.repeat(64),
    exit_code:0,mandatory_tests_verified:true,additional_required_proofs:[],
    tests:names.map(name=>({name,passed:true}))};
  const archive=zipOne('founder-mission-test-evidence.json',receipt);
  const out=await fetchFounderMissionTestEvidence({...request,fetchImpl:async url=>{
    const address=String(url);
    if(address.endsWith('/zip')) return new Response(null,{status:302,headers:{location:'https://productionresultssa0.blob.core.windows.net/actions/receipt.zip'}});
    if(address.startsWith('https://productionresultssa0.blob.core.windows.net/')) return new Response(archive,{status:200});
    return reply(address.includes('/artifacts?')
      ? {artifacts:[{id:456,name:'founder-mission-test-evidence',expired:false,workflow_run:{id:123,head_sha:SHA}}]}
      : {id:123,name:'full-candidate-ci',head_branch:'candidate/mel-clean-autonomy',head_sha:SHA,
         status:'completed',conclusion:'success',run_attempt:1});
  }});
  assert.equal(out.ok,true,JSON.stringify(out));
  assert.equal(out.mandatory_tests_verified,true);
  assert.match(out.digest,/^[a-f0-9]{64}$/);
  assert.equal(out.tests.length,7);
});
