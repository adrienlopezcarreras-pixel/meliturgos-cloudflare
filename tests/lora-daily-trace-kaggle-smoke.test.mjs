import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
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


test('actual workflow smoke normalization follows a growing canonical export and preserves normal requests',()=>{
  const workflow=fs.readFileSync(new URL('../.github/workflows/lora-kaggle-free-gpu.yml',import.meta.url),'utf8');
  const source=workflow.split('# Normalize smoke size from the actual export; never discard canonical lessons.')[1]
    .split('# Build deterministic shard with the effective size used by later stages.')[0]
    .split('\n').map(line=>line.replace(/^ {10}/,'')).join('\n');
  const root=fs.mkdtempSync(join(tmpdir(),'mel-smoke-size-'));
  try {
    for(const [count,requested,smoke,expected] of [[102,92,true,102],[137,92,true,137],[102,150,true,150],[102,750,false,750],[102,92,false,92]]){
      const metadata=join(root,'export.json'),envFile=join(root,'env');
      fs.writeFileSync(metadata,JSON.stringify({examples:count}));fs.writeFileSync(envFile,'');
      const output=execFileSync('bash',['-c',source+'\nprintf "RESULT=%s\\n" "$SHARD_SIZE"'],{encoding:'utf8',env:{...process.env,CANONICAL_EXPORT_META:metadata,GITHUB_ENV:envFile,SHARD_SIZE:String(requested),SMOKE_ONLY:String(smoke)}});
      assert.match(output,new RegExp('RESULT='+expected));
      assert.equal(fs.readFileSync(envFile,'utf8'),expected!==requested?'SHARD_SIZE='+expected+'\n':'');
    }
    fs.writeFileSync(join(root,'export.json'),JSON.stringify({examples:3001}));
    assert.throws(()=>execFileSync('bash',['-ec',source],{stdio:'pipe',env:{...process.env,CANONICAL_EXPORT_META:join(root,'export.json'),GITHUB_ENV:join(root,'env'),SHARD_SIZE:'92',SMOKE_ONLY:'true'}}));
  } finally {fs.rmSync(root,{recursive:true,force:true});}
});

test('canonical-only smoke preserves every real lesson and the undersized shard guard remains fail-closed',()=>{
  const root=fs.mkdtempSync(join(tmpdir(),'mel-smoke-lessons-'));
  const repo=fileURLToPath(new URL('../',import.meta.url));
  try {
    const lessons=join(root,'lessons.jsonl'),output=join(root,'shard.jsonl');
    const exported=JSON.parse(execFileSync('node',['scripts/export-canonical-lora-dataset.mjs','--output',lessons],{cwd:repo,encoding:'utf8'}));
    assert.ok(exported.examples>50);
    const args=['scripts/prepare-kaggle-lora-shard.py','--cycle','4','--shard-size',String(exported.examples-1),'--mel-lessons',lessons,'--output',output];
    try {execFileSync('python',args,{cwd:repo,stdio:'pipe'});assert.fail('normal guard must reject undersized input');}
    catch(error){assert.equal(error.status,1);assert.match(String(error.stderr),/LORA_SHARD_TOO_SMALL_FOR_CANONICAL_LESSONS/);}
    // No public dataset is needed when the smoke covers exactly the complete
    // canonical corpus. This offline provider stub fails if any is queried.
    fs.writeFileSync(join(root,'datasets.py'),'def load_dataset(*args, **kwargs):\n raise AssertionError("canonical-only smoke must not fetch public rows")\n');
    args[args.indexOf('--shard-size')+1]=String(exported.examples);
    execFileSync('python',args,{cwd:repo,stdio:'pipe',env:{...process.env,PYTHONPATH:root}});
    const rows=fs.readFileSync(output,'utf8').trim().split('\n').map(JSON.parse);
    const original=fs.readFileSync(lessons,'utf8').trim().split('\n').map(JSON.parse);
    assert.equal(rows.length,exported.examples);
    assert.deepEqual(rows.map(row=>row.source_id),original.map(row=>row.lesson_id));
    assert.deepEqual(rows.map(row=>row.messages),original.map(row=>row.messages));
    assert.ok(rows.every(row=>row.source==='mel_validated'&&row.verbatim===true));
    const metadata=JSON.parse(fs.readFileSync(output+'.meta.json','utf8'));
    assert.equal(metadata.canonical_mel_lessons,exported.examples);
    assert.equal(metadata.public_examples,0);
  } finally {fs.rmSync(root,{recursive:true,force:true});}
});
