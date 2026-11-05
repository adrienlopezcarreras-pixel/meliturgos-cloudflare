import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,rmSync,chmodSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
const workflow=readFileSync('.github/workflows/mel-pr-council-review.yml','utf8');
const ownerExpression="github.event_name == 'workflow_dispatch' && github.actor == github.repository_owner && inputs.owner_manual_review == true";

test('only explicitly opted-in manual owner dispatch can reach a new open PR; legacy and automatic scopes stay fixed',()=>{
 assert.ok(workflow.includes(ownerExpression));
 assert.match(workflow,/owner_manual_review:[\s\S]*?type: boolean\n        default: false/);
 const start=workflow.indexOf('          case "$PR_NUMBER" in\n');
 const script=workflow.slice(start,workflow.indexOf('\n          esac',start)+'\n          esac'.length);
 const dir=mkdtempSync(join(tmpdir(),'council-owner-scope-'));
 try{
  for(const [pr,state,flag,allowed] of [['3115','open','true',true],['3115','closed','true',false],['3115','open','false',false],['3094','closed','false',true],['3103','closed','true',false],['3112','open','false',true]]){
   let actual=true;try{execFileSync('bash',['-e','-c',script],{env:{...process.env,PR_NUMBER:pr,STATE:state,OWNER_MANUAL_REVIEW:flag,GITHUB_ENV:join(dir,'env')},stdio:'pipe'});}catch{actual=false;}
   assert.equal(actual,allowed,[pr,state,flag].join(':'));
  }
  assert.match(workflow,/github\.event\.workflow_run\.head_branch == 'fix\/max-owner-stop-pauses-runtime-20261104'/);
  assert.doesNotMatch(workflow,/head_branch == 'fix\/max-mentor-head-drift/);
 }finally{rmSync(dir,{recursive:true,force:true});}
});

const gateStart=workflow.indexOf("          const fs=require('node:fs');",workflow.indexOf('council-exact-full-ci.json'));
const gate=workflow.slice(gateStart,workflow.indexOf('\n          NODE',gateStart));
const head='a'.repeat(40),repo='adrienlopezcarreras-pixel/meliturgos-cloudflare';
const goodRun={name:'full-candidate-ci',head_sha:head,status:'completed',conclusion:'success',head_repository:{full_name:repo}};
function ciGate({checks=[{id:1,name:'full-suite',conclusion:'success'}],runs=[goodRun],manual=true,pr='3115',total=checks.length}={}){
 const dir=mkdtempSync(join(tmpdir(),'council-owner-ci-'));
 try{
  writeFileSync(join(dir,'council-checks.json'),JSON.stringify({total_count:total,check_runs:checks}));
  writeFileSync(join(dir,'council-exact-full-ci.json'),JSON.stringify({workflow_runs:runs}));
  try{execFileSync(process.execPath,['-e',gate],{cwd:dir,env:{...process.env,MEL_COUNCIL_PR_NUMBER:pr,MEL_COUNCIL_OWNER_MANUAL_PROFILE:String(manual),MEL_COUNCIL_HEAD_SHA:head,GITHUB_REPOSITORY:repo,GITHUB_OUTPUT:join(dir,'output')},stdio:'pipe'});return readFileSync(join(dir,'output'),'utf8').trim();}catch{return 'DENIED';}
 }finally{rmSync(dir,{recursive:true,force:true});}
}
test('the actual owner CI gate requires a successful exact-SHA full suite from this repository and no red/pending checks',()=>{
 assert.equal(ciGate(),'ready=true');
 for(const run of [{...goodRun,head_sha:'b'.repeat(40)},{...goodRun,conclusion:'failure'},{...goodRun,status:'in_progress'},{...goodRun,name:'impostor'},{...goodRun,head_repository:{full_name:'external/fork'}}])assert.equal(ciGate({runs:[run]}),'DENIED');
 assert.equal(ciGate({manual:false}),'DENIED');
 assert.equal(ciGate({runs:[]}),'DENIED');
 assert.equal(ciGate({total:101}),'DENIED');
 assert.equal(ciGate({checks:[]}), 'ready=false');
 assert.equal(ciGate({checks:[{id:1,name:'full-suite',conclusion:'success'},{id:2,name:'security',conclusion:null}]}),'ready=false');
 assert.equal(ciGate({manual:false,pr:'3094'}),'ready=false','the full release profile cannot be reduced to one check');
 assert.equal(ciGate({manual:false,pr:'3113'}),'ready=false','owner STOP keeps its existing mandatory profile');
});

test('a full-delta baseline must be an ancestor of main and head with a successful canonical release',()=>{
 const dir=mkdtempSync(join(tmpdir(),'council-owner-base-'));
 const git=(...args)=>execFileSync('git',args,{cwd:dir,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
 try{
  git('init','-q');git('config','user.name','Fixture');git('config','user.email','fixture@example.test');
  const tree=execFileSync('git',['hash-object','-t','tree','--stdin'],{cwd:dir,input:'',encoding:'utf8'}).trim();
  const base=git('commit-tree',tree,'-m','base'),main=git('commit-tree',tree,'-p',base,'-m','main'),tip=git('commit-tree',tree,'-p',main,'-m','head'),other=git('commit-tree',tree,'-m','other');
  writeFileSync(join(dir,'gh'),'#!/bin/sh\ncat "$TEST_RELEASE_JSON"\n');chmodSync(join(dir,'gh'),0o755);
  const start=workflow.indexOf('          if [ -n "$REVIEW_BASE_OVERRIDE" ]; then',workflow.indexOf('Bind Council to live open PR'));
  const end=workflow.indexOf('          echo "MEL_COUNCIL_REVIEW_KIND=',start);
  const script=workflow.slice(start,end).replace(/^ {10}/gm,'')+'\nprintf "%s" "$BASE"';
  for(const [selected,flag,state,run,allowed] of [[base,'true','open',{head_sha:base,status:'completed',conclusion:'success'},true],[other,'true','open',{head_sha:other,status:'completed',conclusion:'success'},false],[base,'false','open',{head_sha:base,status:'completed',conclusion:'success'},false],[base,'true','closed',{head_sha:base,status:'completed',conclusion:'success'},false],[base,'true','open',{head_sha:base,status:'completed',conclusion:'failure'},false],[base,'true','open',{head_sha:other,status:'completed',conclusion:'success'},false]]){
   writeFileSync(join(dir,'release.json'),JSON.stringify({workflow_runs:[run]}));
   let result=null;try{result=execFileSync('bash',['-e','-c',script],{cwd:dir,env:{...process.env,PATH:dir+':'+process.env.PATH,REVIEW_BASE_OVERRIDE:selected,OWNER_MANUAL_REVIEW:flag,STATE:state,MAIN:main,HEAD:tip,GITHUB_REPOSITORY:repo,TEST_RELEASE_JSON:join(dir,'release.json')},encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();}catch{}
   assert.equal(result===selected,allowed,[flag,state,run.conclusion].join(':'));
  }
  assert.match(workflow,/COUNCIL_LEGACY_PROFILE_BASE_OVERRIDE_DENIED/);
  assert.match(workflow,/release_authorized:false/);
  assert.match(workflow,/COUNCIL_PR_FINAL_VERDICT_NOT_VERIFIED/);
  assert.match(workflow,/COUNCIL_PR_BASE_CHANGED_DURING_REVIEW/);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
