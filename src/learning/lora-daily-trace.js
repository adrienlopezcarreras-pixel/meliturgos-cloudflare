import { authorizeGitHubActionsOidcRequest } from '../security/github-actions-oidc.js';

const WORKFLOW='lora-kaggle-free-gpu.yml';
const TERMINAL=new Set(['SUCCEEDED','FAILED','CANCELLED','TIMED_OUT','INTERRUPTED','SMOKE_COMPLETED','TRACE_INCOMPLETE']);
const SHA_RE=/^[0-9a-f]{40}$/i;
const HASH_RE=/^[0-9a-f]{64}$/i;

function json(value,status=200){return Response.json(value,{status,headers:{'cache-control':'no-store'}});}
function clean(v,max=4000){return String(v??'').trim().slice(0,max);}
function int(v,fallback=null){const n=Number(v);return Number.isFinite(n)?Math.trunc(n):fallback;}
function parse(raw,fallback){try{return raw?JSON.parse(raw):fallback}catch{return fallback}}
function dayKey(ms){return new Date(ms).toISOString().slice(0,10);}
async function sha256Hex(value){
  const bytes=typeof value==='string'?new TextEncoder().encode(value):value;
  const digest=await crypto.subtle.digest('SHA-256',bytes);
  return [...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,'0')).join('');
}
function stableJson(value){
  if(Array.isArray(value)) return '['+value.map(stableJson).join(',')+']';
  if(value&&typeof value==='object'){
    return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+stableJson(value[k])).join(',')+'}';
  }
  return JSON.stringify(value);
}
function mergeObject(a,b){return {...(a&&typeof a==='object'&&!Array.isArray(a)?a:{}),...(b&&typeof b==='object'&&!Array.isArray(b)?b:{})};}
function mergeArray(a,b){
  const left=Array.isArray(a)?a:[],right=Array.isArray(b)?b:[];
  return [...left,...right].slice(-200);
}
function frenchSummary(run){
  const dataset=parse(run.dataset_json,{});
  const training=parse(run.training_json,{});
  const results=parse(run.results_json,{});
  const errors=parse(run.errors_json,[]);
  const artifacts=parse(run.artifacts_json,[]);
  const bits=[
    `Run LoRA ${run.run_id} — état ${run.status}.`,
    `Code ${run.source_sha.slice(0,12)}, modèle ${run.model_version||run.base_model||'non renseigné'}, cycle ${run.cycle??'—'}.`,
    `Données: ${dataset.examples??'—'} exemples, ${dataset.shard_count??dataset.shards??'—'} shard(s).`,
    `Entraînement: ${training.steps??training.global_step??'—'} étape(s), durée ${training.duration_seconds??'—'} s.`,
    `Résultats: perte ${results.train_loss??results.metrics?.train_loss??'—'}, comparaison précédente ${results.comparison?.summary??results.comparison_status??'—'}.`,
    `Livrables: ${artifacts.length}; erreurs/interruption: ${errors.length}.`,
  ];
  return bits.join(' ');
}
function successCompleteness(run,eventTypes){
  const dataset=parse(run.dataset_json,{});
  const training=parse(run.training_json,{});
  const results=parse(run.results_json,{});
  const artifacts=parse(run.artifacts_json,[]);
  const hasArtifact=artifacts.some(a=>HASH_RE.test(String(a?.sha256||a?.digest||'')) && clean(a?.kind||a?.name||a?.path,300));
  const checks={
    identification:SHA_RE.test(String(run.source_sha||''))&&Boolean(clean(run.model_version||run.base_model,300)),
    dataset:Number.isFinite(Number(dataset.shard_count??dataset.shards))&&Number(dataset.shard_count??dataset.shards)>=1,
    training:Number.isFinite(Number(training.steps??training.global_step))&&Number(training.steps??training.global_step)>=1
      && Number.isFinite(Number(training.duration_seconds))&&Number(training.duration_seconds)>=0,
    results:Boolean(results&&typeof results==='object'&&Object.keys(results).length>0),
    artifacts:hasArtifact,
    summary:clean(run.summary_fr,4000).length>=40,
    event_started:eventTypes.has('STARTED'),
    event_progress:eventTypes.has('TRAINING_PROGRESS')||eventTypes.has('TRAINING_RESULT'),
    event_terminal:eventTypes.has('SUCCEEDED'),
  };
  return {ok:Object.values(checks).every(Boolean),checks};
}

async function loadRun(db,runId){
  return db.prepare('SELECT * FROM lora_training_runs WHERE run_id=?').bind(runId).first();
}
async function eventTypes(db,runId){
  const out=await db.prepare('SELECT event_type FROM lora_training_events WHERE run_id=? ORDER BY seq ASC').bind(runId).all();
  return new Set((out?.results||[]).map(r=>String(r.event_type||'')));
}

export async function appendLoraDailyTrace(env={},body={},identity={}){
  const db=env?.DB;
  if(!db?.prepare) throw Object.assign(new Error('D1_NOT_BOUND'),{status:503,code:'D1_NOT_BOUND'});
  const runId=clean(body.run_id,200);
  const eventType=clean(body.event_type,80).toUpperCase();
  const seq=int(body.seq);
  const now=int(body.occurred_at,Date.now());
  const sourceSha=clean(body.source_sha,40).toLowerCase();
  if(!/^[A-Za-z0-9._:-]{3,200}$/.test(runId)||!eventType||!Number.isInteger(seq)||seq<1||seq>100000||!SHA_RE.test(sourceSha)){
    throw Object.assign(new Error('LORA_TRACE_INPUT_INVALID'),{status:400,code:'LORA_TRACE_INPUT_INVALID'});
  }
  if(identity?.run_id && int(body.workflow_run_id,identity.run_id)!==identity.run_id){
    throw Object.assign(new Error('LORA_TRACE_RUN_IDENTITY_MISMATCH'),{status:403,code:'LORA_TRACE_RUN_IDENTITY_MISMATCH'});
  }
  const previous=await loadRun(db,runId);
  if(!previous && eventType!=='STARTED') throw Object.assign(new Error('LORA_TRACE_START_REQUIRED'),{status:409,code:'LORA_TRACE_START_REQUIRED'});
  if(previous && seq<=Number(previous.last_seq||0)){
    const existing=await db.prepare('SELECT payload_sha256,event_type FROM lora_training_events WHERE run_id=? AND seq=?').bind(runId,seq).first();
    const payloadHash=await sha256Hex(stableJson(body.payload||{}));
    if(existing&&existing.payload_sha256===payloadHash&&existing.event_type===eventType){
      return {ok:true,idempotent:true,run:previous};
    }
    throw Object.assign(new Error('LORA_TRACE_SEQUENCE_CONFLICT'),{status:409,code:'LORA_TRACE_SEQUENCE_CONFLICT'});
  }

  const payload=body.payload&&typeof body.payload==='object'&&!Array.isArray(body.payload)?body.payload:{};
  const payloadJson=stableJson(payload);
  const payloadHash=await sha256Hex(payloadJson);
  const prevTrace=String(previous?.trace_sha256||'');
  const traceHash=await sha256Hex(prevTrace+'|'+seq+'|'+eventType+'|'+payloadHash);

  const startedAt=previous?.started_at||int(body.started_at,now);
  const status=clean(body.status||payload.status||(eventType==='STARTED'?'RUNNING':previous?.status||'RUNNING'),60).toUpperCase();
  const dataset=mergeObject(parse(previous?.dataset_json,{}),body.dataset||payload.dataset);
  const training=mergeObject(parse(previous?.training_json,{}),body.training||payload.training);
  const results=mergeObject(parse(previous?.results_json,{}),body.results||payload.results);
  const errors=mergeArray(parse(previous?.errors_json,[]),body.errors||payload.errors);
  const artifacts=mergeArray(parse(previous?.artifacts_json,[]),body.artifacts||payload.artifacts);
  let summary=clean(body.summary_fr||payload.summary_fr||previous?.summary_fr,8000);
  const finishedAt=TERMINAL.has(status)?now:(previous?.finished_at||null);

  if(!previous){
    await db.prepare(`INSERT INTO lora_training_runs(
      run_id,workflow_run_id,workflow_run_number,workflow_attempt,source_sha,workflow_sha,model_version,base_model,cycle,status,
      started_at,updated_at,finished_at,dataset_json,training_json,results_json,errors_json,artifacts_json,summary_fr,trace_sha256,last_seq,trace_verified
    ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0)`).bind(
      runId,int(body.workflow_run_id,identity?.run_id||null),int(body.workflow_run_number,identity?.run_number||null),int(body.workflow_attempt,1),
      sourceSha,clean(body.workflow_sha||identity?.sha,40).toLowerCase(),clean(body.model_version,300),clean(body.base_model,300),int(body.cycle),
      status,startedAt,now,finishedAt,stableJson(dataset),stableJson(training),stableJson(results),stableJson(errors),stableJson(artifacts),summary,traceHash,seq
    ).run();
  }else{
    await db.prepare(`UPDATE lora_training_runs SET status=?,updated_at=?,finished_at=?,dataset_json=?,training_json=?,results_json=?,
      errors_json=?,artifacts_json=?,summary_fr=?,trace_sha256=?,last_seq=?,model_version=?,base_model=?,cycle=? WHERE run_id=?`).bind(
      status,now,finishedAt,stableJson(dataset),stableJson(training),stableJson(results),stableJson(errors),stableJson(artifacts),summary,traceHash,seq,
      clean(body.model_version||previous.model_version,300),clean(body.base_model||previous.base_model,300),int(body.cycle,previous.cycle),runId
    ).run();
  }
  await db.prepare('INSERT INTO lora_training_events(run_id,seq,event_type,occurred_at,payload_json,payload_sha256) VALUES(?,?,?,?,?,?)')
    .bind(runId,seq,eventType,now,payloadJson,payloadHash).run();

  let run=await loadRun(db,runId);
  if(TERMINAL.has(status)&&!summary){
    summary=frenchSummary(run);
    await db.prepare('UPDATE lora_training_runs SET summary_fr=? WHERE run_id=?').bind(summary,runId).run();
    run=await loadRun(db,runId);
  }

  let verification={ok:false,checks:{}};
  if(status==='SUCCEEDED'){
    verification=successCompleteness(run,await eventTypes(db,runId));
    if(!verification.ok){
      await db.prepare("UPDATE lora_training_runs SET status='TRACE_INCOMPLETE',trace_verified=0,finished_at=? WHERE run_id=?").bind(now,runId).run();
      run=await loadRun(db,runId);
    }else{
      await db.prepare('UPDATE lora_training_runs SET trace_verified=1 WHERE run_id=?').bind(runId).run();
      run=await loadRun(db,runId);
    }
  }else if(TERMINAL.has(status)){
    await db.prepare('UPDATE lora_training_runs SET trace_verified=1 WHERE run_id=?').bind(runId).run();
    run=await loadRun(db,runId);
  }

  const day=dayKey(startedAt);
  if(!previous){
    await db.prepare(`INSERT INTO lora_daily_status(day,first_run_at,last_run_at,run_count,successful_count,failed_count,absence_reported_at,last_run_id,report_fr,updated_at)
      VALUES(?,?,?,1,0,0,NULL,?,'',?)
      ON CONFLICT(day) DO UPDATE SET first_run_at=COALESCE(first_run_at,excluded.first_run_at),last_run_at=excluded.last_run_at,
      run_count=run_count+1,last_run_id=excluded.last_run_id,absence_reported_at=NULL,report_fr='',updated_at=excluded.updated_at`)
      .bind(day,startedAt,startedAt,runId,now).run();
  }else{
    await db.prepare('UPDATE lora_daily_status SET last_run_at=?,last_run_id=?,updated_at=? WHERE day=?').bind(now,runId,now,day).run();
  }
  const wasTerminal=TERMINAL.has(String(previous?.status||''));
  if(!wasTerminal&&TERMINAL.has(String(run.status||''))){
    const success=run.status==='SUCCEEDED'&&Number(run.trace_verified)===1;
    const failure=!success&&run.status!=='SMOKE_COMPLETED';
    await db.prepare(`UPDATE lora_daily_status SET successful_count=successful_count+?,failed_count=failed_count+?,
      report_fr=?,updated_at=? WHERE day=?`).bind(success?1:0,failure?1:0,run.summary_fr||frenchSummary(run),now,day).run();
  }

  if(status==='SUCCEEDED'&&!verification.ok){
    return {ok:false,status:'TRACE_INCOMPLETE',run,verification};
  }
  return {ok:true,status:run.status,run,verification};
}

export async function listLoraDailyTraces(env={}, {limit=30,day=null}={}){
  const db=env?.DB;if(!db?.prepare) throw Object.assign(new Error('D1_NOT_BOUND'),{status:503});
  const n=Math.max(1,Math.min(100,int(limit,30)));
  let rows;
  if(day){
    const start=Date.parse(day+'T00:00:00.000Z'),end=start+86400000;
    rows=await db.prepare('SELECT * FROM lora_training_runs WHERE started_at>=? AND started_at<? ORDER BY started_at DESC LIMIT ?').bind(start,end,n).all();
  }else rows=await db.prepare('SELECT * FROM lora_training_runs ORDER BY started_at DESC LIMIT ?').bind(n).all();
  return (rows?.results||[]).map(row=>({...row,dataset:parse(row.dataset_json,{}),training:parse(row.training_json,{}),results:parse(row.results_json,{}),errors:parse(row.errors_json,[]),artifacts:parse(row.artifacts_json,[])}));
}
export async function getLoraDailyTrace(env={},runId){
  const run=await loadRun(env?.DB,runId);if(!run)return null;
  const events=await env.DB.prepare('SELECT seq,event_type,occurred_at,payload_json,payload_sha256 FROM lora_training_events WHERE run_id=? ORDER BY seq ASC').bind(runId).all();
  return {...run,dataset:parse(run.dataset_json,{}),training:parse(run.training_json,{}),results:parse(run.results_json,{}),errors:parse(run.errors_json,[]),artifacts:parse(run.artifacts_json,[]),events:(events?.results||[]).map(e=>({...e,payload:parse(e.payload_json,{})}))};
}
export async function markMissingLoraTrainingDay(env={}, {now=Date.now(),day=null}={}){
  const db=env?.DB;if(!db?.prepare)return {ok:false,status:'D1_NOT_BOUND'};
  const target=day||dayKey(Number(now)-86400000);
  const row=await db.prepare('SELECT * FROM lora_daily_status WHERE day=?').bind(target).first();
  if(row&&Number(row.run_count||0)>0)return {ok:true,status:'RUN_PRESENT',day:target,run_count:Number(row.run_count)};
  const ts=Number(now);
  const report=`Aucun entraînement LoRA MEL n'a démarré le ${target}. Cette absence est enregistrée comme anomalie quotidienne à investiguer.`;
  await db.prepare(`INSERT INTO lora_daily_status(day,first_run_at,last_run_at,run_count,successful_count,failed_count,absence_reported_at,last_run_id,report_fr,updated_at)
    VALUES(?,NULL,NULL,0,0,0,NULL,NULL,?,?)
    ON CONFLICT(day) DO UPDATE SET report_fr=excluded.report_fr,updated_at=excluded.updated_at`).bind(target,report,ts).run();
  const current=await db.prepare('SELECT * FROM lora_daily_status WHERE day=?').bind(target).first();
  if(!current?.absence_reported_at){
    await db.prepare('UPDATE lora_daily_status SET absence_reported_at=? WHERE day=?').bind(ts,target).run();
  }
  return {ok:true,status:'NO_TRAINING_STARTED',day:target,report_fr:report};
}
export async function getLoraDailyStatus(env={},day){
  return env?.DB?.prepare ? env.DB.prepare('SELECT * FROM lora_daily_status WHERE day=?').bind(day).first() : null;
}

export async function maybeHandleLoraTraceInternal(request,env={}){
  const url=new URL(request.url);
  if(url.pathname!=='/api/internal/lora-trace')return null;
  if(request.method!=='POST')return json({ok:false,code:'METHOD_NOT_ALLOWED'},405);
  const auth=await authorizeGitHubActionsOidcRequest(request,env,{
    allowedWorkflows:[WORKFLOW],
    allowedWorkflowBranches:['main','candidate/mel-clean-autonomy','audit/final-hardening-cleanup-20261007'],
    allowedEvents:['workflow_dispatch','push'],
  });
  if(!auth.ok)return json({ok:false,code:auth.code},auth.status||401);
  const body=await request.json().catch(()=>null);
  if(!body)return json({ok:false,code:'JSON_REQUIRED'},400);
  try{
    const result=await appendLoraDailyTrace(env,body,auth.identity);
    return json(result,result.ok===false?409:200);
  }catch(error){
    return json({ok:false,code:clean(error?.code||error?.message,180)},Number(error?.status)||500);
  }
}
