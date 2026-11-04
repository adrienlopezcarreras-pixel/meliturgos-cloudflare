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

test('case variants of a single Council model cannot impersonate two independent reviewers',async()=>{
  const db=sqliteD1({maintenanceFence:true});
  try{
    const aliased=async()=>({decision:'APPROVED',reviews:[
      {model:'@cf/meta/llama-reviewer',verdict:'APPROVE',summary:'security checked'},
      {model:'@CF/META/LLAMA-REVIEWER',verdict:'APPROVE',summary:'integration checked'},
    ]});
    const result=(await call(db,batch(plan.batches[0]),aliased)).result;
    assert.equal(result.batch_decision,'COUNCIL_BATCH_QUORUM_UNPROVEN');
    assert.equal(result.decision,'COUNCIL_BATCH_NOT_APPROVED');
    for(const b of plan.batches)
      assert.equal((await call(db,batch(b))).result.batch_decision,'APPROVED');
    const finalResult=(await call(db,final,aliased)).result;
    assert.equal(finalResult.decision,'COUNCIL_FINAL_QUORUM_UNPROVEN');
    assert.equal(finalResult.complete_review,false);
  }finally{db.close();}
});

test('Council batch and final approvals require a majority of every returned reviewer seat',async()=>{
  const db=sqliteD1({maintenanceFence:true});
  try{
    const minority=async()=>({decision:'APPROVED',reviews:[
      {model:'reviewer-a',verdict:'APPROVE',summary:'security checked'},
      {model:'reviewer-b',verdict:'APPROVE',summary:'integration checked'},
      {model:'reviewer-c',verdict:'REJECT',summary:'safety concern'},
      {model:'reviewer-d',verdict:'REJECT',summary:'untested change'},
      {model:'reviewer-e',verdict:'REJECT',summary:'integration risk'},
    ]});
    const denied=(await call(db,batch(plan.batches[0]),minority)).result;
    assert.equal(denied.batch_decision,'COUNCIL_BATCH_QUORUM_UNPROVEN');
    assert.equal(denied.decision,'COUNCIL_BATCH_NOT_APPROVED');
    for(const b of plan.batches)
      assert.equal((await call(db,batch(b))).result.batch_decision,'APPROVED');
    const blocked=(await call(db,final,minority)).result;
    assert.equal(blocked.decision,'COUNCIL_FINAL_QUORUM_UNPROVEN');
    assert.equal(blocked.complete_review,false);
    const verified=(await call(db,final)).result;
    assert.equal(verified.decision,'APPROVED');
    assert.equal(verified.complete_review,true);
  }finally{db.close();}
});

test('unanswered seats and blocking objections cannot inflate a Council majority',async()=>{
  const db=sqliteD1({maintenanceFence:true});
  try{
    const vote=async()=>({decision:'APPROVED',reviews:[
      {model:'model-a',verdict:'APPROVE',summary:'security checked'},
      {model:'model-b',verdict:'APPROVE',summary:'integration checked'},
      null,
      {model:'model-c',verdict:null,error:'REVIEW_TIMEOUT'},
    ]});
    assert.equal((await call(db,batch(plan.batches[0]),vote)).result.batch_decision,
      'COUNCIL_BATCH_QUORUM_UNPROVEN');
    const selfContradictory=async()=>({decision:'APPROVED',reviews:[
      {model:'model-a',verdict:'APPROVE',summary:'security checked',blocking:['unsafe']},
      {model:'model-b',verdict:'APPROVE',summary:'integration checked'},
    ]});
    assert.equal((await call(db,batch(plan.batches[0]),selfContradictory)).result.batch_decision,
      'COUNCIL_BATCH_QUORUM_UNPROVEN');
  }finally{db.close();}
});

test('the independent final integration vote cannot approve without two distinct reasons',async()=>{
  const db=sqliteD1({maintenanceFence:true});
  try{
    for(const b of plan.batches){
      assert.equal((await call(db,batch(b))).result.batch_decision,'APPROVED');
    }
    for(const reviews of [
      [],
      [{model:'one',verdict:'APPROVE',summary:'security checked'}],
      [{model:'same',verdict:'APPROVE',summary:'security checked'},
       {model:'same',verdict:'APPROVE',summary:'integration checked'}],
      [{model:'one',verdict:'APPROVE',summary:'security checked'},
       {model:'two',verdict:'APPROVE',summary:' '}],
    ]){
      const result=(await call(db,final,async()=>({decision:'APPROVED',reviews}))).result;
      assert.equal(result.decision,'COUNCIL_FINAL_QUORUM_UNPROVEN');
      assert.equal(result.complete_review,false);
      const row=await db.prepare('SELECT metadata_json FROM dev_bridge_state WHERE bridge_id=?')
        .bind('council-review:'+head).first();
      assert.equal(JSON.parse(row.metadata_json).decision,'COUNCIL_FINAL_QUORUM_UNPROVEN');
    }
    const accepted=(await call(db,final,approved)).result;
    assert.equal(accepted.decision,'APPROVED');
    assert.equal(accepted.complete_review,true);
  }finally{db.close();}
});

test('malformed null review rows never crash otherwise valid independent Council votes',async()=>{
  const db=sqliteD1({maintenanceFence:true});
  try {
    const vote=async()=>({decision:'APPROVED',reviews:[null,...approvals,null]});
    for(const b of plan.batches)
      assert.equal((await call(db,batch(b),vote)).result.batch_decision,'APPROVED');
    const result=(await call(db,final,vote)).result;
    assert.equal(result.decision,'APPROVED');
    assert.equal(result.complete_review,true);
  }finally{db.close();}
});

test('empty independent vote fails closed without throwing or persisting an approval',async()=>{
  const db=sqliteD1({maintenanceFence:true});
  try {
    const result=(await call(db,batch(plan.batches[0]),async()=>undefined)).result;
    assert.equal(result.batch_decision,'COUNCIL_BATCH_VOTE_MISSING');
    assert.equal(result.decision,'COUNCIL_BATCH_NOT_APPROVED');
  }finally{db.close();}
});

test('previously approved Council batch cache is not trusted when model quorum vanishes',async()=>{
  const db=sqliteD1({maintenanceFence:true});
  try{
    const item=batch(plan.batches[0]);
    assert.equal((await call(db,item)).result.batch_decision,'APPROVED');
    const key='council-diff-batch:'+head+':'+base+':'+h(source)+':1';
    const row=await db.prepare('SELECT metadata_json FROM dev_bridge_state WHERE bridge_id=?')
      .bind(key).first();
    const old=JSON.parse(row.metadata_json);
    await db.prepare('UPDATE dev_bridge_state SET metadata_json=? WHERE bridge_id=?')
      .bind(JSON.stringify({...old,reviews:[approvals[0]]}),key).run();
    let calls=0;
    const unproven=await call(db,item,async()=>{calls++;return {
      decision:'APPROVED',reviews:[{model:'single',verdict:'APPROVE',summary:'only one reviewer'}],
    };});
    assert.equal(calls,1);
    assert.equal(unproven.result.batch_decision,'COUNCIL_BATCH_QUORUM_UNPROVEN');
    assert.notEqual(unproven.result.cached,true);
    assert.equal((await call(db,item)).result.batch_decision,'APPROVED');
  }finally{db.close();}
});

test('previously approved final Council cache must re-vote after quorum or manifest tampering',async()=>{
  for(const tamper of [
    row=>({...row,reviews:[approvals[0]]}),
    row=>({...row,batch_hashes:['wrong']}),
    row=>({...row,mode:'LEGACY_UNVERIFIED'}),
  ]){
    const db=sqliteD1({maintenanceFence:true});
    try{
      for(const b of plan.batches)
        assert.equal((await call(db,batch(b))).result.batch_decision,'APPROVED');
      assert.equal((await call(db,final)).result.decision,'APPROVED');
      const key='council-review:'+head;
      const row=await db.prepare('SELECT metadata_json FROM dev_bridge_state WHERE bridge_id=?')
        .bind(key).first();
      await db.prepare('UPDATE dev_bridge_state SET metadata_json=? WHERE bridge_id=?')
        .bind(JSON.stringify(tamper(JSON.parse(row.metadata_json))),key).run();
      let calls=0;
      const unproven=(await call(db,final,async()=>{
        calls++;return {decision:'APPROVED',reviews:[approvals[0]]};
      })).result;
      assert.equal(calls,1,'tampered cache must trigger fresh independent review');
      assert.equal(unproven.decision,'COUNCIL_FINAL_QUORUM_UNPROVEN');
      assert.equal(unproven.complete_review,false);
      const restored=(await call(db,final)).result;
      assert.equal(restored.decision,'APPROVED');
      assert.equal(restored.complete_review,true);
    }finally{db.close();}
  }
});
