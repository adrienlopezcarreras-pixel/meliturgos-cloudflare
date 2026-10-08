#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const EVENT=String(process.argv[2]||'').trim().toUpperCase();
if(!EVENT){console.error('LORA_TRACE_EVENT_REQUIRED');process.exit(2);}
const payloadPath=process.argv[3]&&process.argv[3]!=='-'?process.argv[3]:null;
const statusArg=process.argv[4]&&process.argv[4]!=='-'?process.argv[4]:null;
const runnerTemp=process.env.RUNNER_TEMP||process.cwd();
const seqFile=path.join(runnerTemp,'mel-lora-trace-seq.txt');
const artifactDir=path.resolve(process.env.MEL_LORA_TRACE_ARTIFACT_DIR||'artifacts');
const journalPath=path.join(artifactDir,'lora-daily-trace.jsonl');
fs.mkdirSync(artifactDir,{recursive:true});

let seq=0;
try{seq=Number(fs.readFileSync(seqFile,'utf8').trim())||0}catch{}
seq+=1;
fs.writeFileSync(seqFile,String(seq)+'\n');

let payload={};
if(payloadPath){
  try{
    payload=JSON.parse(fs.readFileSync(payloadPath,'utf8'));
    if(!payload||typeof payload!=='object'||Array.isArray(payload))throw new Error('object required');
  }catch(error){
    console.error('LORA_TRACE_PAYLOAD_INVALID',error?.message||error);
    process.exit(2);
  }
}
const sourceSha=String(process.env.SOURCE_SHA||process.env.GITHUB_SHA||'').trim().toLowerCase();
if(!/^[0-9a-f]{40}$/.test(sourceSha)){console.error('LORA_TRACE_SOURCE_SHA_INVALID');process.exit(2);}
const workflowSha=String(process.env.GITHUB_SHA||'').trim().toLowerCase();
const runId=String(process.env.MEL_LORA_TRACE_RUN_ID||`gh-${process.env.GITHUB_RUN_ID||'unknown'}-${process.env.GITHUB_RUN_ATTEMPT||'1'}`).trim();
const baseModel=String(process.env.MEL_LORA_BASE_MODEL||'mistralai/Mistral-7B-Instruct-v0.2');
const modelVersion=String(process.env.MEL_LORA_MODEL_VERSION||baseModel);
const body={
  run_id:runId,
  seq,
  event_type:EVENT,
  status:String(statusArg||payload.status||(EVENT==='STARTED'?'RUNNING':'')).trim().toUpperCase()||undefined,
  occurred_at:Date.now(),
  workflow_run_id:Number(process.env.GITHUB_RUN_ID||0)||null,
  workflow_run_number:Number(process.env.GITHUB_RUN_NUMBER||0)||null,
  workflow_attempt:Number(process.env.GITHUB_RUN_ATTEMPT||1)||1,
  workflow_sha:/^[0-9a-f]{40}$/.test(workflowSha)?workflowSha:null,
  source_sha:sourceSha,
  model_version:modelVersion,
  base_model:baseModel,
  cycle:Number.isFinite(Number(process.env.CYCLE))?Number(process.env.CYCLE):null,
  payload,
  ...(payload.dataset?{dataset:payload.dataset}:{}),
  ...(payload.training?{training:payload.training}:{}),
  ...(payload.results?{results:payload.results}:{}),
  ...(payload.errors?{errors:Array.isArray(payload.errors)?payload.errors:[payload.errors]}:{}),
  ...(payload.artifacts?{artifacts:Array.isArray(payload.artifacts)?payload.artifacts:[payload.artifacts]}:{}),
  ...(payload.summary_fr?{summary_fr:String(payload.summary_fr)}:{}),
};
fs.appendFileSync(journalPath,JSON.stringify({direction:'OUT',...body})+'\n');

const oidcUrl=process.env.ACTIONS_ID_TOKEN_REQUEST_URL;
const oidcRequestToken=process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN;
if(!oidcUrl||!oidcRequestToken){console.error('LORA_TRACE_GITHUB_OIDC_ENV_MISSING');process.exit(3);}
const oidcResponse=await fetch(oidcUrl+(oidcUrl.includes('?')?'&':'?')+'audience=meliturgos-worker',{
  headers:{authorization:'bearer '+oidcRequestToken,accept:'application/json'},
  signal:AbortSignal.timeout(15000),
});
if(!oidcResponse.ok){console.error('LORA_TRACE_OIDC_FAILED',oidcResponse.status);process.exit(3);}
const oidc=await oidcResponse.json();
if(!oidc?.value){console.error('LORA_TRACE_OIDC_TOKEN_MISSING');process.exit(3);}

const endpoint=String(process.env.MEL_LORA_TRACE_ENDPOINT||'https://meliturgos.adrien-lopezcarreras.workers.dev/api/internal/lora-trace');
const response=await fetch(endpoint,{
  method:'POST',
  headers:{'content-type':'application/json','x-mel-github-oidc':String(oidc.value)},
  body:JSON.stringify(body),
  signal:AbortSignal.timeout(30000),
});
const raw=await response.text();
let parsed=null;try{parsed=raw?JSON.parse(raw):null}catch{}
fs.appendFileSync(journalPath,JSON.stringify({direction:'IN',seq,event_type:EVENT,http_status:response.status,response:parsed||raw.slice(0,4000)})+'\n');
if(!response.ok||parsed?.ok!==true){
  console.error('LORA_TRACE_WRITE_FAILED',response.status,parsed?.code||parsed?.status||raw.slice(0,300));
  process.exit(EVENT==='SUCCEEDED'?5:4);
}
console.log(JSON.stringify({status:'LORA_TRACE_WRITTEN',run_id:runId,seq,event_type:EVENT,trace_status:parsed.status||null}));
