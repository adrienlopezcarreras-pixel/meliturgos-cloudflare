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
const spoolDir=path.join(artifactDir,'lora-trace-pending');
fs.mkdirSync(artifactDir,{recursive:true});
fs.mkdirSync(spoolDir,{recursive:true});

const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const terminalEvents=new Set(['SUCCEEDED','FAILED','CANCELLED','TIMED_OUT','INTERRUPTED','SMOKE_COMPLETED','TRACE_INCOMPLETE']);

function journal(value){
  fs.appendFileSync(journalPath,JSON.stringify({at:new Date().toISOString(),...value})+'\n');
}
function pendingFiles(){
  return fs.readdirSync(spoolDir)
    .filter(name=>/^\d{6}-.*\.json$/.test(name))
    .sort()
    .map(name=>path.join(spoolDir,name));
}
async function oidcToken(){
  const oidcUrl=process.env.ACTIONS_ID_TOKEN_REQUEST_URL;
  const oidcRequestToken=process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN;
  if(!oidcUrl||!oidcRequestToken)throw Object.assign(new Error('LORA_TRACE_GITHUB_OIDC_ENV_MISSING'),{code:'LORA_TRACE_GITHUB_OIDC_ENV_MISSING'});
  const response=await fetch(oidcUrl+(oidcUrl.includes('?')?'&':'?')+'audience=meliturgos-worker',{
    headers:{authorization:'bearer '+oidcRequestToken,accept:'application/json'},
    signal:AbortSignal.timeout(15000),
  });
  if(!response.ok)throw Object.assign(new Error('LORA_TRACE_OIDC_FAILED:'+response.status),{code:'LORA_TRACE_OIDC_FAILED'});
  const body=await response.json();
  if(!body?.value)throw Object.assign(new Error('LORA_TRACE_OIDC_TOKEN_MISSING'),{code:'LORA_TRACE_OIDC_TOKEN_MISSING'});
  return String(body.value);
}
async function deliver(file){
  const body=JSON.parse(fs.readFileSync(file,'utf8'));
  const endpoint=String(process.env.MEL_LORA_TRACE_ENDPOINT||'https://meliturgos.adrien-lopezcarreras.workers.dev/api/internal/lora-trace');
  let last={status:0,parsed:null,raw:'',error:null};
  for(let attempt=1;attempt<=5;attempt+=1){
    try{
      const token=await oidcToken();
      const response=await fetch(endpoint,{
        method:'POST',
        headers:{'content-type':'application/json','x-mel-github-oidc':token},
        body:JSON.stringify(body),
        signal:AbortSignal.timeout(30000),
      });
      const raw=await response.text();
      let parsed=null;try{parsed=raw?JSON.parse(raw):null}catch{}
      last={status:response.status,parsed,raw,error:null};
      journal({direction:'IN',attempt,seq:body.seq,event_type:body.event_type,http_status:response.status,response:parsed||raw.slice(0,4000)});
      if(response.ok&&parsed?.ok===true){
        fs.unlinkSync(file);
        return {ok:true,parsed};
      }
      if(response.status>=400&&response.status<500&&![408,409,425,429].includes(response.status))break;
    }catch(error){
      last={status:0,parsed:null,raw:'',error:String(error?.code||error?.message||error).slice(0,300)};
      journal({direction:'RETRY_ERROR',attempt,seq:body.seq,event_type:body.event_type,error:last.error});
    }
    if(attempt<5)await sleep(Math.min(20000,1000*(2**(attempt-1))));
  }
  return {ok:false,...last};
}
async function flushPending(){
  for(const file of pendingFiles()){
    const result=await deliver(file);
    if(!result.ok)return {ok:false,file,result};
  }
  return {ok:true};
}

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

journal({direction:'OUT',...body});
const spoolName=String(seq).padStart(6,'0')+'-'+EVENT.toLowerCase()+'.json';
const spoolPath=path.join(spoolDir,spoolName);
fs.writeFileSync(spoolPath,JSON.stringify(body)+'\n');

const flushed=await flushPending();
if(!flushed.ok){
  const queued=pendingFiles().map(file=>path.basename(file));
  journal({direction:'QUEUE_RETAINED',seq,event_type:EVENT,pending:queued,error:flushed.result?.error||flushed.result?.parsed?.code||flushed.result?.status||null});
  console.error('LORA_TRACE_WRITE_FAILED_QUEUE_RETAINED',JSON.stringify({event:EVENT,seq,pending:queued,http_status:flushed.result?.status||0,error:flushed.result?.error||flushed.result?.parsed?.code||null}));
  // A run may never be green while durable tracing is unavailable. Intermediate
  // failures deliberately fail the workflow; the always() terminal step can
  // retry the same ordered spool if connectivity returns before runner teardown.
  process.exit(terminalEvents.has(EVENT)||EVENT==='SUCCEEDED'?5:4);
}

console.log(JSON.stringify({status:'LORA_TRACE_WRITTEN_AND_SPOOL_EMPTY',run_id:runId,seq,event_type:EVENT,pending:0}));
