import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, webcrypto } from 'node:crypto';
import { sqliteD1 } from './helpers/sqlite-d1.mjs';
import { planCouncilDiffBatches } from '../src/evolution/council-diff-batches.js';
import { handleCouncilBatchedReview } from '../src/evolution/council-batch-review.js';

const sha1='a'.repeat(40),sha2='b'.repeat(40);
const h=data=>createHash('sha256').update(data).digest('hex');
const input=Array.from({length:10},(_,i)=>
  'diff --git a/src/part-'+i+'.js b/src/part-'+i+'.js\n'+
  '--- a/src/part-'+i+'.js\n+++ b/src/part-'+i+'.js\n'+
  '@@ -1,0 +1,810 @@\n'+'+const important = "review in full";\n'.repeat(810)
).join('');
const plan=planCouncilDiffBatches(input);
const common={head:sha1,base:sha2,root_sha256:h(input),
  batch_count:plan.batchCount,file_count:plan.fileCount,total_bytes:plan.totalBytes};
const reviewers=()=>[{model:'reviewer-one',verdict:'APPROVE',summary:'complete review'},
  {model:'reviewer-two',verdict:'APPROVE',summary:'security checked'},
  {model:'reviewer-three',verdict:'APPROVE',summary:'integration checked'}];
const approved=async()=>({decision:'APPROVED',reviews:reviewers()});
const call=(DB,body,review=approved)=>handleCouncilBatchedReview({DB},body,{review,cryptoImpl:webcrypto,now:123456});
const batch=(chunk)=>({...common,mode:'batch',batch_index:chunk.number,
  batch_sha256:h(chunk.diff),diff:chunk.diff});
const finish={...common,mode:'final'};

test('Council refuses global approval until every complete independently approved batch exists',async()=>{
  assert.equal(plan.ok,true);
  assert.ok(plan.batchCount>1);
  const DB=sqliteD1({maintenanceFence:true});
  let counted=0;
  const review=async (_e,{diff})=>{counted++; assert.ok(diff.length>100);return approved();};
  try{
    const before=await call(DB,finish,review);
    assert.equal(before.status,409);
    assert.equal(before.result.code,'COUNCIL_BATCH_REVIEWS_INCOMPLETE');
    for(let i=0;i<plan.batches.length-1;i++){
      const result=await call(DB,batch(plan.batches[i]),review);
      assert.equal(result.result.decision,'PENDING_ALL_BATCH_REVIEWS');
      assert.equal(result.result.batch_decision,'APPROVED');
    }
    assert.equal((await call(DB,finish,review)).result.code,'COUNCIL_BATCH_REVIEWS_INCOMPLETE');
    const last=await call(DB,batch(plan.batches.at(-1)),review);
    assert.equal(last.result.batch_decision,'APPROVED');
    const all=await call(DB,finish,review);
    assert.equal(all.result.decision,'APPROVED');
    assert.equal(all.result.complete_review,true);
    assert.equal(all.result.batch_count,plan.batchCount);
    assert.equal(counted,plan.batchCount+1);
    const rec=await DB.prepare('SELECT metadata_json FROM dev_bridge_state WHERE bridge_id=?')
      .bind('council-review:'+sha1).first();
    const record=JSON.parse(rec.metadata_json);
    assert.equal(record.mode,'COMPLETE_INDEPENDENT_MULTI_BATCH_REVIEW');
    assert.equal(record.root_sha256,h(input));
    assert.equal(record.batch_hashes.length,plan.batchCount);
    const again=await call(DB,finish,async()=>{throw Error('cache must not call AI');});
    assert.equal(again.result.cached,true);
  }finally{DB.close();}
});

test('Council fails closed on forged chunks, stale approval and mismatched root/manifest',async()=>{
  const DB=sqliteD1({maintenanceFence:true});
  try{
    const first=batch(plan.batches[0]);
    assert.equal((await call(DB,{...first,batch_sha256:'0'.repeat(64)})).result.code,'COUNCIL_BATCH_DIGEST_MISMATCH');
    assert.equal((await call(DB,{...first,diff:first.diff+'+forgery\n'})).result.code,'COUNCIL_BATCH_DIGEST_MISMATCH');
    assert.equal((await call(DB,first)).result.batch_decision,'APPROVED');
    const changedRoot={...first,root_sha256:'f'.repeat(64)};
    assert.equal((await call(DB,changedRoot)).result.batch_decision,'APPROVED');
    assert.equal((await call(DB,finish)).result.code,'COUNCIL_BATCH_REVIEWS_INCOMPLETE');
    const changedData={...first,diff:first.diff+'+forgery\n',batch_sha256:h(first.diff+'+forgery\n')};
    assert.equal((await call(DB,changedData)).result.code,'COUNCIL_BATCH_IMMUTABLE_CONFLICT');
    assert.equal((await call(DB,{...first,head:'bad'})).result.code,'COUNCIL_BATCH_INPUT_INVALID');
    assert.equal((await call(DB,{...first,diff:'x'.repeat(45_000)})).result.code,'COUNCIL_BATCH_INPUT_INVALID');
  }finally{DB.close();}
});

test('a rejection or absent independent quorum cannot be converted into global approval',async()=>{
  const DB=sqliteD1({maintenanceFence:true});
  try{
    for(const [i,chunk] of plan.batches.entries()){
      const rejected=i===1
        ? async()=>({decision:'REJECTED',reviews:[{model:'reviewer-one',verdict:'REJECT',summary:'unsafe'}]})
        : approved;
      const result=await call(DB,batch(chunk),rejected);
      assert.equal(result.result.batch_decision,i===1?'REJECTED':'APPROVED');
    }
    let called=false;
    const result=await call(DB,finish,async()=>{called=true;return approved();});
    assert.equal(result.result.code,'COUNCIL_BATCH_REVIEWS_INCOMPLETE');
    assert.equal(called,false);
  }finally{DB.close();}
});

test('Council endpoint keeps GitHub OIDC before batched review; workflow demands every vote',async()=>{
  const {readFileSync}=await import('node:fs');
  const source=readFileSync(new URL('../src/evolution/council-review.js',import.meta.url),'utf8');
  const handler=source.slice(source.indexOf('export async function handleCouncilReviewRequest'));
  assert.ok(handler.indexOf('authorizeGitHubActionsOidcRequest')<handler.indexOf('handleCouncilBatchedReview'));
  assert.match(handler,/allowedWorkflows: \['mel-candidate-promotion.yml'\]/);
  const workflow=readFileSync(new URL('../.github/workflows/mel-candidate-promotion.yml',import.meta.url),'utf8');
  assert.match(workflow,/run-council-batch-review\.mjs/);
  assert.match(workflow,/COUNCIL_BATCH_REVIEW_NOT_APPROVED/);
  assert.ok(workflow.indexOf('run-council-batch-review.mjs') < workflow.indexOf('DECISION='));
  const script=readFileSync(new URL('../scripts/run-council-batch-review.mjs',import.meta.url),'utf8');
  assert.match(script,/batch_decision!=='APPROVED'/);
  assert.match(script,/complete_review!==true/);
  assert.doesNotMatch(script,/COUNCIL_REVIEW_OVERRIDE/);
});

test('Council batch rejections cannot be re-reviewed into an approval on the same SHA',async()=>{
  const DB=sqliteD1({maintenanceFence:true});
  try{
    const target=batch(plan.batches[0]);
    assert.equal((await call(DB,target,async()=>({
      decision:'REJECTED',reviews:[{model:'security-reviewer',verdict:'REJECT',
        blocking:['unsafe fallback'],summary:'refused'}],
    }))).result.batch_decision,'REJECTED');
    const again=await call(DB,target,async()=>{throw Error('NO RE-REVIEW ALLOWED');});
    assert.equal(again.status,409);
    assert.equal(again.result.batch_decision,'REJECTED');
  }finally{DB.close();}
});
test('models with duplicate identities or empty reasons cannot prove a batch quorum',async()=>{
  const DB=sqliteD1({maintenanceFence:true});
  try{
    const first=batch(plan.batches[0]);
    const wrong=await call(DB,first,async()=>({decision:'APPROVED',reviews:[
      {model:'same-model',verdict:'APPROVE',summary:'one'},
      {model:'same-model',verdict:'APPROVE',summary:'two'},
    ]}));
    assert.equal(wrong.result.batch_decision,'COUNCIL_BATCH_QUORUM_UNPROVEN');
    assert.equal(wrong.result.decision,'COUNCIL_BATCH_NOT_APPROVED');
    assert.equal((await call(DB,finish)).result.code,'COUNCIL_BATCH_REVIEWS_INCOMPLETE');
  }finally{DB.close();}
});
test('larger Council batches extend workflow budget without weakening authorization',()=>{
  const workflow=readFileSync(new URL('../.github/workflows/mel-candidate-promotion.yml',import.meta.url),'utf8');
  assert.match(workflow,/timeout-minutes: 45/);
  assert.match(workflow,/allowed.*Council|COUNCIL_BATCH_REVIEW_NOT_APPROVED/);
});

test('long multi-batch review renews its GitHub OIDC identity for every Council request',()=>{
  const source=readFileSync(new URL('../scripts/run-council-batch-review.mjs',import.meta.url),'utf8');
  assert.match(source,/async function currentOidcToken\(\)/);
  assert.match(source,/ACTIONS_ID_TOKEN_REQUEST_URL/);
  assert.match(source,/ACTIONS_ID_TOKEN_REQUEST_TOKEN/);
  assert.match(source,/issuerUrl\.searchParams\.set\('audience','meliturgos-worker'\)/);
  assert.match(source,/const freshToken=await currentOidcToken\(\)/);
  assert.match(source,/'x-mel-github-oidc':freshToken/);
  assert.doesNotMatch(source,/'x-mel-github-oidc':token/);
});
