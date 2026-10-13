import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, chmodSync, rmSync, existsSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';

const SCRIPT=path.resolve('scripts/finalize-lora.mjs');
const WORKFLOW=readFileSync('.github/workflows/lora-kaggle-free-gpu.yml','utf8');
const FAKE_SECRET='MEL_LORA_FIXTURE_SECRET_NEVER_EXPOSE';

function sandbox(curlSource,argv=[]){
  const root=mkdtempSync(path.join(os.tmpdir(),'mel-lora-finalize-audit-'));
  const dir=path.join(root,'weights'),bin=path.join(root,'bin');
  mkdirSync(dir);mkdirSync(bin);
  writeFileSync(path.join(dir,'lora-plan.json'),JSON.stringify({id:'fixture-plan'}));
  writeFileSync(path.join(dir,'artifact-evidence.json'),JSON.stringify({finetune_id:'fixture-finetune'}));
  writeFileSync(path.join(dir,'approval-evidence.json'),JSON.stringify({approval_id:'fixture-approval'}));
  const curl=path.join(bin,'curl');
  writeFileSync(curl,'#!/bin/sh\n'+curlSource+'\n');
  chmodSync(curl,0o755);
  const env={...process.env,PATH:bin+path.delimiter+process.env.PATH,
    MELITURGOS_PASSWORD:FAKE_SECRET,MEL_LORA_ACTIVATION_APPROVED:''};
  const run=spawnSync(process.execPath,[SCRIPT,'--dir',dir,'--url','https://example.invalid',...argv],
    {encoding:'utf8',env,timeout:10000});
  const request=existsSync(path.join(dir,'.benchmark-request.json'))
    ? JSON.parse(readFileSync(path.join(dir,'.benchmark-request.json'),'utf8')):null;
  rmSync(root,{recursive:true,force:true});
  return {run,request};
}
test('Kaggle canonical benchmark explicitly prohibits activation',()=>{
  const start=WORKFLOW.indexOf('- name: Benchmark isolated preview');
  const end=WORKFLOW.indexOf('- name: Upload non-secret evidence',start);
  assert.ok(start>0&&end>start);
  const section=WORKFLOW.slice(start,end);
  assert.match(section,/--activate false/);
  assert.doesNotMatch(section,/--activate true/);
});
test('default canonical benchmark never asks for activation',()=>{
  const shell=`printf '%s\\n' '{"ok":true,"activated":false,"baseline":{"overall":0.55},"candidate":{"overall":0.58}}' '__MEL_HTTP_STATUS__:200'`;
  const {run,request}=sandbox(shell,['--allow-not-activated','true']);
  assert.equal(run.status,0,run.stderr);
  assert.equal(request?.activate,false);
  assert.doesNotMatch(run.stderr+run.stdout,/MEL_LORA_FIXTURE_SECRET_NEVER_EXPOSE/);
});
test('explicit model activation is rejected without separate authorization',()=>{
  const {run,request}=sandbox('exit 9',['--activate','true']);
  assert.equal(run.status,1);
  assert.match(run.stderr,/LORA_ACTIVATION_REQUIRES_EXPLICIT_AUTHORIZATION/);
  assert.equal(request,null);
  assert.doesNotMatch(run.stderr, /MEL_LORA_FIXTURE_SECRET_NEVER_EXPOSE/);
});
test('curl failures never echo authorization header or passwords',()=>{
  const {run}=sandbox("echo 'SENSITIVE_STDERR_FIXTURE' >&2; exit 7",['--allow-not-activated','true']);
  assert.equal(run.status,1);
  assert.match(run.stderr,/LORA_BENCHMARK_TRANSPORT_FAILED_CURL_FAILED/);
  assert.doesNotMatch(run.stderr+run.stdout,/MEL_LORA_FIXTURE_SECRET_NEVER_EXPOSE|SENSITIVE_STDERR_FIXTURE|Authorization: Bearer/);
});
test('remote activation despite activate:false is treated as a failure',()=>{
  const shell=`printf '%s\\n' '{"ok":true,"activated":true,"baseline":{"overall":0.55},"candidate":{"overall":0.58}}' '__MEL_HTTP_STATUS__:200'`;
  const {run,request}=sandbox(shell,['--allow-not-activated','true']);
  assert.equal(request?.activate,false);
  assert.equal(run.status,1);
  assert.match(run.stderr,/LORA_UNREQUESTED_ACTIVATION_REPORTED/);
});

test('a 200 OK response with no measured scores is not a successful benchmark',()=>{
  const shell=`printf '%s\\n' '{"ok":true,"activated":false}' '__MEL_HTTP_STATUS__:200'`;
  const {run,request}=sandbox(shell,['--allow-not-activated','true']);
  assert.equal(request?.activate,false);
  assert.equal(run.status,1);
  assert.match(run.stderr,/LORA_BENCHMARK_MEASUREMENTS_MISSING_OR_INVALID/);
  assert.doesNotMatch(run.stderr, /MEL_LORA_FIXTURE_SECRET_NEVER_EXPOSE/);
});
