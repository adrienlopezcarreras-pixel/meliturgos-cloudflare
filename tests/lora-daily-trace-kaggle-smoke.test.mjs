import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { verifyKaggleSmoke, verifyKaggleSmokeFiles } from '../scripts/verify-kaggle-smoke-proof.mjs';

const SHA='a'.repeat(40);
const json=v=>Buffer.from(JSON.stringify(v));
const hash=b=>'sha256:'+createHash('sha256').update(b).digest('hex');

function fixture() {
  const evidence={training_metrics:{global_step:1,train_loss:0.76}};
  const started={cuda_available:true,gpu:'Tesla T4',max_steps:1};
  const progress=[{event:'TRAIN_BEGIN',global_step:0},{event:'STEP',global_step:1},{event:'TRAIN_END',global_step:1}];
  const eData=json(evidence);
  const pData=Buffer.from(progress.map(p=>JSON.stringify(p)).join('\n')+'\n');
  const evidenceDigest=hash(eData),progressDigest=hash(pData);
  const proof={
    schema:'mel.kaggle-real-smoke-proof/v1',status:'KAGGLE_SINGLE_STEP_SMOKE_PASSED',
    source_sha:SHA,cycle:0,global_step:1,optimizer_step_events:[1],
    cuda_available:true,gpu:'Tesla T4',train_loss:0.76,
    training_evidence_sha256:evidenceDigest,
    training_progress_sha256:progressDigest,
    benchmark_verified:false,adapter_activated:false,
  };
  return {proof,evidence,started,progress,evidenceDigest,progressDigest,eData,pData};
}

test('real Kaggle smoke proof requires one GPU optimizer step and honest no-activation result',()=>{
  const {eData,pData,...value}=fixture();
  const r=verifyKaggleSmoke({...value,expectedSha:SHA,expectedCycle:0});
  assert.equal(r.status,'SMOKE_STEP_VERIFIED');
  assert.equal(r.global_step,1);
  assert.equal(r.adapter_activated,false);
  assert.equal(r.benchmark_verified,false);
});

test('a Kaggle kernel reporting success without actual optimizer evidence is never a successful smoke',()=>{
  const {eData,pData,...base}=fixture();
  for (const modifications of [
    {progress:[]},
    {progress:[{event:'TRAIN_BEGIN',global_step:0}]},
    {evidence:{training_metrics:{global_step:0}}},
    {started:{cuda_available:false,gpu:'',max_steps:1}},
    {proof:{...base.proof,global_step:0}},
    {proof:{...base.proof,source_sha:'b'.repeat(40)}},
    {proof:{...base.proof,benchmark_verified:true}},
    {evidenceDigest:'sha256:'+'0'.repeat(64)},
  ]) {
    assert.throws(()=>verifyKaggleSmoke({...base,expectedSha:SHA,expectedCycle:0,...modifications}),/KAGGLE_SMOKE_/);
  }
});

test('files downloaded from Kaggle must contain evidence and hash-matching progress',()=>{
  const f=fixture();
  const root=fs.mkdtempSync(join(tmpdir(),'mel-kaggle-smoke-'));
  try {
    fs.writeFileSync(join(root,'kaggle-smoke-proof.json'),JSON.stringify(f.proof));
    fs.writeFileSync(join(root,'training-evidence.json'),f.eData);
    fs.writeFileSync(join(root,'training-started.json'),JSON.stringify(f.started));
    fs.writeFileSync(join(root,'training-progress.jsonl'),f.pData);
    const result=verifyKaggleSmokeFiles({inputDir:root,expectedSha:SHA,expectedCycle:0});
    assert.equal(result.status,'SMOKE_STEP_VERIFIED');
    fs.writeFileSync(join(root,'training-progress.jsonl'),Buffer.from('{"event":"STEP","global_step":2}\n'));
    assert.throws(()=>verifyKaggleSmokeFiles({inputDir:root,expectedSha:SHA,expectedCycle:0}),/KAGGLE_SMOKE_/);
  } finally {fs.rmSync(root,{recursive:true,force:true});}
});

test('Kaggle smoke has bounded timeout and is never marked successful by fabricated step counters',()=>{
  const workflow=fs.readFileSync(new URL('../.github/workflows/lora-kaggle-free-gpu.yml',import.meta.url),'utf8');
  const py=fs.readFileSync(new URL('../kaggle/mel-lora-uncensored/run.py',import.meta.url),'utf8');
  assert.ok(workflow.includes('KAGGLE_KERNEL_TIMEOUT_SECONDS="1800"'));
  assert.ok(workflow.includes('KAGGLE_MONITOR_GRACE_SECONDS="300"'));
  assert.ok(workflow.includes('-t "$KAGGLE_KERNEL_TIMEOUT_SECONDS"'));
  assert.ok(workflow.includes('node scripts/verify-kaggle-smoke-proof.mjs'));
  assert.ok(!workflow.includes('training:{steps:1,global_step:1,duration_seconds:0,smoke_only:true}'));
  assert.ok(py.includes('"KAGGLE_SMOKE_OPTIMIZER_STEP_NOT_PROVEN"'));
  assert.ok(py.includes('kaggle-smoke-proof.json'));
  assert.ok(workflow.includes('env.SMOKE_ONLY != \'true\''));
});
