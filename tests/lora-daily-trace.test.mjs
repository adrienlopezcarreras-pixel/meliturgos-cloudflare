import test from 'node:test';
import assert from 'node:assert/strict';
import { sqliteD1 } from './helpers/sqlite-d1.mjs';
import { prepareGen2 } from '../src/persistence/gen2-schema.js';
import {
  appendLoraDailyTrace,
  getLoraDailyStatus,
  getLoraDailyTrace,
  listLoraDailyTraces,
  markMissingLoraTrainingDay,
} from '../src/learning/lora-daily-trace.js';

const SHA='a'.repeat(40);
const ID={run_id:9001,run_number:77,sha:'b'.repeat(40)};

async function setup(){
  const DB=sqliteD1();
  await prepareGen2(DB);
  return {DB};
}
function base(run_id='gh-9001-1',seq=1,event_type='STARTED',status='RUNNING',payload={}){
  return {
    run_id,seq,event_type,status,source_sha:SHA,workflow_run_id:9001,workflow_run_number:77,workflow_attempt:1,
    workflow_sha:ID.sha,model_version:'mistralai/Mistral-7B-Instruct-v0.2',base_model:'mistralai/Mistral-7B-Instruct-v0.2',
    cycle:4,occurred_at:Date.parse('2026-10-08T01:00:00Z')+seq*1000,payload,
  };
}

test('complete LoRA run becomes SUCCEEDED only after all durable evidence exists',async()=>{
  const env=await setup();
  await appendLoraDailyTrace(env,base());
  await appendLoraDailyTrace(env,{...base('gh-9001-1',2,'DATASET_PREPARED'),dataset:{shard_count:1,examples:750,sha256:'c'.repeat(64)}},ID);
  await appendLoraDailyTrace(env,{...base('gh-9001-1',3,'TRAINING_PROGRESS'),training:{global_step:16,last_progress:'STEP 16'}},ID);
  await appendLoraDailyTrace(env,{...base('gh-9001-1',4,'TRAINING_RESULT'),training:{steps:32,global_step:32,duration_seconds:812,parameters:{rank:16}},results:{train_loss:0.42,tests:{exact_provenance:true},comparison:{summary:'meilleur que le précédent'}},artifacts:[{kind:'adapter',name:'adapter_model.safetensors',sha256:'d'.repeat(64)}]},ID);
  const done=await appendLoraDailyTrace(env,{...base('gh-9001-1',5,'SUCCEEDED','SUCCEEDED'),summary_fr:'Entraînement LoRA terminé et vérifié avec métriques, comparaison et adaptateur SHA-256 conservés durablement.'},ID);
  assert.equal(done.ok,true);
  assert.equal(done.status,'SUCCEEDED');
  assert.equal(Number(done.run.trace_verified),1);
  assert.match(done.run.trace_sha256,/^[0-9a-f]{64}$/);

  const detail=await getLoraDailyTrace(env,'gh-9001-1');
  assert.equal(detail.events.length,5);
  assert.equal(detail.events[0].event_type,'STARTED');
  assert.equal(detail.events.at(-1).event_type,'SUCCEEDED');
  assert.equal(detail.dataset.shard_count,1);
  assert.equal(detail.training.steps,32);
  assert.equal(detail.results.train_loss,0.42);
  assert.equal(detail.artifacts[0].sha256,'d'.repeat(64));

  const rows=await listLoraDailyTraces(env,{limit:5,day:'2026-10-08'});
  assert.equal(rows.length,1);
  const daily=await getLoraDailyStatus(env,'2026-10-08');
  assert.equal(Number(daily.run_count),1);
  assert.equal(Number(daily.successful_count),1);
  assert.equal(Number(daily.failed_count),0);
});

test('LoRA SUCCESS is rejected and converted to TRACE_INCOMPLETE without verifiable evidence',async()=>{
  const env=await setup();
  await appendLoraDailyTrace(env,base());
  const result=await appendLoraDailyTrace(env,{...base('gh-9001-1',2,'SUCCEEDED','SUCCEEDED'),summary_fr:'Résumé trop pauvre mais assez long pour isoler les autres champs manquants dans le test.'},ID);
  assert.equal(result.ok,false);
  assert.equal(result.status,'TRACE_INCOMPLETE');
  assert.equal(Number(result.run.trace_verified),0);
  assert.equal(result.verification.checks.dataset,false);
  assert.equal(result.verification.checks.artifacts,false);
  const daily=await getLoraDailyStatus(env,'2026-10-08');
  assert.equal(Number(daily.successful_count),0);
  assert.equal(Number(daily.failed_count),1);
});

test('failed LoRA run remains trace-verified even without checkpoint and retains errors',async()=>{
  const env=await setup();
  await appendLoraDailyTrace(env,base());
  await appendLoraDailyTrace(env,{...base('gh-9001-1',2,'TRAINING_PROGRESS'),training:{global_step:8}},ID);
  const failed=await appendLoraDailyTrace(env,{...base('gh-9001-1',3,'FAILED','FAILED'),errors:[{code:'CUDA_OOM',message:'out of memory'}],summary_fr:'Entraînement LoRA en échec après huit étapes; erreur CUDA OOM conservée avec la progression antérieure.'},ID);
  assert.equal(failed.ok,true);
  assert.equal(failed.status,'FAILED');
  assert.equal(Number(failed.run.trace_verified),1);
  const trace=await getLoraDailyTrace(env,'gh-9001-1');
  assert.equal(trace.errors[0].code,'CUDA_OOM');
  assert.equal(trace.events.length,3);
});

test('trace sequence is idempotent only for the same payload and rejects conflicting rewrites',async()=>{
  const env=await setup();
  const started=base();
  const first=await appendLoraDailyTrace(env,started,ID);
  assert.equal(first.ok,true);
  const duplicate=await appendLoraDailyTrace(env,started,ID);
  assert.equal(duplicate.idempotent,true);
  await assert.rejects(
    ()=>appendLoraDailyTrace(env,{...started,payload:{changed:true}},ID),
    err=>err?.code==='LORA_TRACE_SEQUENCE_CONFLICT',
  );
});

test('a day without any training is persistently reported and does not fabricate a run',async()=>{
  const env=await setup();
  const result=await markMissingLoraTrainingDay(env,{day:'2026-10-07',now:Date.parse('2026-10-08T00:17:00Z')});
  assert.equal(result.ok,true);
  assert.equal(result.status,'NO_TRAINING_STARTED');
  const daily=await getLoraDailyStatus(env,'2026-10-07');
  assert.equal(Number(daily.run_count),0);
  assert.ok(Number(daily.absence_reported_at)>0);
  assert.match(daily.report_fr,/Aucun entraînement LoRA MEL/);
  const rows=await listLoraDailyTraces(env,{day:'2026-10-07'});
  assert.equal(rows.length,0);
});
