import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash, webcrypto } from 'node:crypto';
import { sqliteD1 } from './helpers/sqlite-d1.mjs';
import { planCouncilDiffBatches } from '../src/evolution/council-diff-batches.js';
import { handleCouncilBatchedReview } from '../src/evolution/council-batch-review.js';

const head='a'.repeat(40), base='b'.repeat(40);
const h=x=>createHash('sha256').update(x).digest('hex');
const source=Array.from({length:10},(_,i)=>
  'diff --git a/src/part-'+i+'.js b/src/part-'+i+'.js\n'+
  '--- a/src/part-'+i+'.js\n+++ b/src/part-'+i+'.js\n'+
  '@@ -1,0 +1,810 @@\n'+'+const important = "review in full";\n'.repeat(810)
).join('');
const plan=planCouncilDiffBatches(source);
const common={head,base,root_sha256:h(source),batch_count:plan.batchCount,
  file_count:plan.fileCount,total_bytes:plan.totalBytes};
const approvals=[{model:'model-a',verdict:'APPROVE',summary:'security checked'},
  {model:'model-b',verdict:'APPROVE',summary:'integration checked'},
  {model:'model-c',verdict:'APPROVE',summary:'tested'}];
const approved=async()=>({decision:'APPROVED',reviews:approvals});
const call=(db,body,review=approved)=>handleCouncilBatchedReview({DB:db},body,
  {review,cryptoImpl:webcrypto,now:123456});
const batch=b=>({...common,mode:'batch',batch_index:b.number,batch_sha256:h(b.diff),diff:b.diff});
const final={...common,mode:'final'};
const file=p=>readFileSync(new URL(p,import.meta.url),'utf8');

test('every real batch and distinct final Council vote are required; SHA cache preserves full proof',async()=>{
  assert.equal(plan.ok,true);
  assert.ok(plan.batchCount>1);
  const db=sqliteD1({maintenanceFence:true});
  let calls=0;
  const vote=async()=>{calls++;return approved();};
  try{
    assert.equal((await call(db,final,vote)).result.code,'COUNCIL_BATCH_REVIEWS_INCOMPLETE');
    for(const b of plan.batches.slice(0,-1)){
      assert.equal((await call(db,batch(b),vote)).result.batch_decision,'APPROVED');
    }
    assert.equal((await call(db,final,vote)).status,409);
    assert.equal((await call(db,batch(plan.batches.at(-1)),vote)).result.batch_decision,'APPROVED');
    const result=(await call(db,final,vote)).result;
    assert.equal(result.decision,'APPROVED');
    assert.equal(result.complete_review,true);
    assert.equal(result.batch_count,plan.batchCount);
    assert.equal(calls,plan.batchCount+1);
    const row=await db.prepare('SELECT metadata_json FROM dev_bridge_state WHERE bridge_id=?')
      .bind('council-review:'+head).first();
    const saved=JSON.parse(row.metadata_json);
    assert.equal(saved.mode,'COMPLETE_INDEPENDENT_MULTI_BATCH_REVIEW');
    assert.equal(saved.root_sha256,h(source));
    assert.equal(saved.batch_hashes.length,plan.batchCount);
    const cached=(await call(db,final,async()=>{throw Error('must not re-vote');})).result;
    assert.equal(cached.cached,true);
    assert.equal(cached.complete_review,true);
  }finally{db.close();}
});

test('forgery, tampered stored batch, altered input and stale head fail closed',async()=>{
  const db=sqliteD1({maintenanceFence:true});
  try{
    const b=batch(plan.batches[0]);
    assert.equal((await call(db,{...b,batch_sha256:'0'.repeat(64)})).result.code,'COUNCIL_BATCH_DIGEST_MISMATCH');
    assert.equal((await call(db,{...b,diff:b.diff+'+forgery\n'})).result.code,'COUNCIL_BATCH_DIGEST_MISMATCH');
    assert.equal((await call(db,b)).result.batch_decision,'APPROVED');
    assert.equal((await call(db,{...b,root_sha256:'f'.repeat(64)})).result.batch_decision,'APPROVED');
    assert.equal((await call(db,final)).result.code,'COUNCIL_BATCH_REVIEWS_INCOMPLETE');
    const changed=b.diff+'+forgery\n';
    assert.equal((await call(db,{...b,diff:changed,batch_sha256:h(changed)})).result.code,'COUNCIL_BATCH_IMMUTABLE_CONFLICT');
    assert.equal((await call(db,{...b,head:'invalid'})).result.code,'COUNCIL_BATCH_INPUT_INVALID');
    assert.equal((await call(db,{...b,diff:'x'.repeat(45_000)})).result.code,'COUNCIL_BATCH_INPUT_INVALID');
    const key='council-diff-batch:'+head+':'+base+':'+h(source)+':1';
    await db.prepare('UPDATE dev_bridge_state SET metadata_json=? WHERE bridge_id=?')
      .bind(JSON.stringify({head,base,root:h(source),count:plan.batchCount,
        total:plan.totalBytes,files:plan.fileCount,index:1,sha256:h(b.diff),
        diff:'corrupt',decision:'APPROVED',reviews:approvals}),key).run();
    assert.equal((await call(db,final)).result.code,'COUNCIL_BATCH_STORED_DIFF_TAMPERED');
  }finally{db.close();}
});

test('a rejected batch remains rejected and can never yield a final approval',async()=>{
  const db=sqliteD1({maintenanceFence:true});
  try{
    for(const [i,b] of plan.batches.entries()){
      const vote=i===1?async()=>({decision:'REJECTED',
        reviews:[{model:'model-a',verdict:'REJECT',summary:'unsafe'}]}):approved;
      const res=await call(db,batch(b),vote);
      assert.equal(res.result.batch_decision,i===1?'REJECTED':'APPROVED');
    }
    assert.equal((await call(db,final,async()=>{throw Error('must not ask final Council');}))
      .result.code,'COUNCIL_BATCH_REVIEWS_INCOMPLETE');
    assert.equal((await call(db,batch(plan.batches[1]),async()=>{throw Error('no vote shopping');}))
      .result.batch_decision,'REJECTED');
  }finally{db.close();}
});

test('duplicate model identities and absent reasons do not establish quorum',async()=>{
  const db=sqliteD1({maintenanceFence:true});
  try{
    const vote=async()=>({decision:'APPROVED',reviews:[
      {model:'same',verdict:'APPROVE',summary:'one'},
      {model:'same',verdict:'APPROVE',summary:'two'}]});
    assert.equal((await call(db,batch(plan.batches[0]),vote)).result.batch_decision,
      'COUNCIL_BATCH_QUORUM_UNPROVEN');
    assert.equal((await call(db,final)).result.code,'COUNCIL_BATCH_REVIEWS_INCOMPLETE');
  }finally{db.close();}
});

test('authenticated endpoint and MAX promotion must fail closed',()=>{
  const endpoint=file('../src/evolution/council-review.js');
  const handler=endpoint.slice(endpoint.indexOf('export async function handleCouncilReviewRequest'));
  assert.ok(handler.indexOf('authorizeGitHubActionsOidcRequest')<
    handler.indexOf('handleCouncilBatchedReview'));
  assert.ok(handler.includes("'mel-pr-council-review.yml'"));
  const promotion=file('../.github/workflows/mel-candidate-promotion.yml');
  assert.ok(promotion.includes('timeout-minutes: 45'));
  assert.ok(promotion.includes('run-council-batch-review.mjs'));
  assert.ok(promotion.includes('COUNCIL_BATCH_REVIEW_NOT_APPROVED'));
  assert.ok(promotion.indexOf('run-council-batch-review.mjs')<promotion.indexOf('DECISION='));
  const runner=file('../scripts/run-council-batch-review.mjs');
  assert.ok(runner.includes("batch_decision!=='APPROVED'"));
  assert.ok(runner.includes('complete_review!==true'));
  assert.ok(!runner.includes('COUNCIL_REVIEW_OVERRIDE'));
});

test('OIDC identity is renewed for every individual review',()=>{
  const runner=file('../scripts/run-council-batch-review.mjs');
  for(const token of ['async function currentOidcToken()',
    'ACTIONS_ID_TOKEN_REQUEST_URL','ACTIONS_ID_TOKEN_REQUEST_TOKEN',
    "issuerUrl.searchParams.set('audience','meliturgos-worker')",
    'const freshToken=await currentOidcToken()',
    "'x-mel-github-oidc':freshToken"])assert.ok(runner.includes(token),token);
  assert.ok(!runner.includes("'x-mel-github-oidc':token"));
});

test('read-only PR review binds immutable head and base without mistaking moved main for base',()=>{
  const workflow=file('../.github/workflows/mel-pr-council-review.yml');
  for(const token of ['workflow_dispatch:','ref: main','test "$HEAD" = "$EXPECTED_SHA"',
    'test "$REPO" = "$GITHUB_REPOSITORY"',
    'BASE="$(git merge-base "$MAIN" "$HEAD")"',
    'COUNCIL_PR_MAIN_HEAD_PATH_CONFLICT','MEL_COUNCIL_MAIN_SHA=$MAIN',
    'CURRENT_MAIN" != "$MEL_COUNCIL_MAIN_SHA',
    'run-council-batch-review.mjs council.diff council.log',
    'COUNCIL_PR_HEAD_OR_BASE_CHANGED_DURING_REVIEW',
    'result.root_sha256!==manifest.sha256','id-token: write',
    'contents: read','council-pr-review-receipt'])assert.ok(workflow.includes(token),token);
  for(const forbidden of ['contents: write','git push','wrangler deploy',
    'npm run deploy','DEPLOY_APPROVED'])assert.ok(!workflow.includes(forbidden),forbidden);
});
