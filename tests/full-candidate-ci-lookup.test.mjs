import test from 'node:test';
import assert from 'node:assert/strict';
import {findGreenFullCandidateRun,verifyCompletionEvidence} from '../src/teachers/github-completion-reconciler.js';
const sha='a'.repeat(40), branch='candidate/mel-clean-autonomy';
const env={MEL_GITHUB_REPOSITORY:'owner/repo',MEL_TEACHER_BRANCH:branch,MEL_GITHUB_TOKEN:'synthetic-test-token'};
const green={id:123,head_sha:sha,head_branch:branch,status:'completed',conclusion:'success',name:'full-candidate-ci'};

test('exact green full CI is read with the configured credential and reused, never rerun',async()=>{
 const run=await findGreenFullCandidateRun(env,sha,{fetchImpl:async(url,init)=>{
  assert.equal(new URL(url).hostname,'api.github.com');assert.equal(init.method,undefined);
  assert.equal(init.headers.authorization,'Bearer synthetic-test-token');
  assert.equal(init.redirect,'manual');assert.ok(init.signal); // Workers rejects redirect:'error'
  return Response.json({workflow_runs:[green]});
 }});assert.equal(run,123);
});

test('missing, failed, wrong SHA and wrong branch runs remain unapproved',async()=>{
 for(const rows of [[],[{...green,head_sha:'b'.repeat(40)}],[{...green,head_branch:'main'}],[{...green,conclusion:'failure'}],[{...green,status:'in_progress'}]]){
  assert.equal(await findGreenFullCandidateRun(env,sha,{fetchImpl:async()=>Response.json({workflow_runs:rows})}),null);
 }
});

test('public read remains possible without inventing a credential',async()=>{
 await findGreenFullCandidateRun({},sha,{fetchImpl:async(_url,init)=>{
  assert.equal(init.headers.authorization,undefined);return Response.json({workflow_runs:[]});
 }});
});

test('HTTP refusal, transport and malformed response are failures, never evidence of absent CI',async()=>{
 for(const status of [401,403,429,500]) await assert.rejects(
  findGreenFullCandidateRun(env,sha,{fetchImpl:async()=>Response.json({},{status})}),error=>error.status===status);
 await assert.rejects(findGreenFullCandidateRun(env,sha,{fetchImpl:async()=>{throw new Error('synthetic transport error');}}),error=>error.code==='COMPLETION_GITHUB_TRANSPORT_FAILED');
 for(const response of [()=>Response.json({}),()=>new Response('not JSON')]) await assert.rejects(
  findGreenFullCandidateRun(env,sha,{fetchImpl:async()=>response()}),error=>error.code==='COMPLETION_GITHUB_RESPONSE_INVALID');
});

test('the final completion verifier uses the same authentication and exact identity gates',async()=>{
 const completion={candidate_branch:branch,candidate_sha:sha,ci_run_id:123};
 const checked=await verifyCompletionEvidence(completion,env,{fetchImpl:async(_url,init)=>{
  assert.equal(init.headers.authorization,'Bearer synthetic-test-token');return Response.json(green);
 }});assert.equal(checked.verified,true);
 await assert.rejects(verifyCompletionEvidence(completion,env,{fetchImpl:async()=>Response.json({...green,head_sha:'b'.repeat(40)})}),error=>error.code==='COMPLETION_CI_EVIDENCE_INVALID');
});

test('a GitHub redirect is a failure, never evidence (redirect:manual on Workers)',async()=>{
 await assert.rejects(findGreenFullCandidateRun(env,sha,{fetchImpl:async()=>new Response(null,{status:302,headers:{location:'https://example.com'}})}),{code:'COMPLETION_GITHUB_VERIFY_FAILED',status:302});
});
