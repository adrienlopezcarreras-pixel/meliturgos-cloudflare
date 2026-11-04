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

test('scheduled Council recovers missed CI events and merged PR history safely',()=>{
  const workflow=file('../.github/workflows/mel-pr-council-review.yml');
  for(const token of [
    "schedule:\n    - cron: '47 */2 * * *'",
    "discover:\n    if: github.event_name == 'schedule'",
    'repos/$GITHUB_REPOSITORY/pulls/3094',
    'if [ "$STATE" = "open" ]',
    'test "$BASE" = "main"',
    'test "$REPO" = "$GITHUB_REPOSITORY"',
    '[[ "$HEAD" =~ ^[a-f0-9]{40}$ ]]',
    'needs: [discover]',
    "needs.discover.result == 'success' && needs.discover.outputs.eligible == 'true'",
    'inputs.expected_sha || needs.discover.outputs.head',
    'inputs.pr_number || needs.discover.outputs.pr_number',
    "needs: [discover, preflight]",
    "pull-requests: read",
  ])assert.ok(workflow.includes(token),token);
  // Scheduled checks may never bypass the exact-commit CI gate or deployment
  // restrictions simply because they were launched by a cron.
  assert.ok(workflow.indexOf('Require every exact-SHA CI gate before automatic Council review')
    <workflow.indexOf('Full multi-batch independent Council verdict'));
  assert.ok(!workflow.includes('pull_request_target:'));
  assert.ok(!workflow.includes('contents: write'));
  assert.ok(!workflow.includes('wrangler deploy'));
  assert.ok(!workflow.includes('git push'));
});

test('automatic Council is scoped to trusted CI completion, exact PR head and all green gates',()=>{
  const workflow=file('../.github/workflows/mel-pr-council-review.yml');
  for(const expected of [
    'workflow_run:', 'types: [completed]',
    '- MEL external contingency monitor',
    '- mel-work-free-validation',
    '- hardware-lab-ci',
    '- lora-runtime-pipeline-ci',
    '- mel-self-audit-supervisor-ci',
    '- cloudflare-api-relay',
    "github.event.workflow_run.conclusion == 'success'",
    "github.event.workflow_run.event == 'pull_request'",
    "github.event.workflow_run.head_branch == 'integration/max-contingency-release-candidate'",
    "github.event.workflow_run.pull_requests[0].number != null",
    'github.event.workflow_run.head_sha || inputs.expected_sha',
    'github.event.workflow_run.pull_requests[0].number || inputs.pr_number',
    'Require every exact-SHA CI gate before automatic Council review',
    'COUNCIL_CI_INCOMPLETE_CHECK_LIST',
    'COUNCIL_CI_REQUIRED_CHECK_NOT_GREEN',
    'COUNCIL_CI_NOT_ALL_COMPLETE_AND_GREEN',
    "const pending=mandatory.filter(name=>latest.get(name)?.conclusion!=='success')",
    "const ready=pending.length===0&&unfinished.length===0",
    "fs.appendFileSync(fsOut,'ready='+String(ready)+'\\n')",
    "needs.preflight.outputs.ready == 'true'",
  ])assert.ok(workflow.includes(expected),expected);
  assert.ok(workflow.indexOf('Require every exact-SHA CI gate before automatic Council review')
    <workflow.indexOf('Full multi-batch independent Council verdict'));
  assert.equal((workflow.match(/needs\.preflight\.outputs\.ready == 'true'/g)||[]).length,1);
  assert.ok(workflow.includes('id: ci_gate'));
  assert.ok(workflow.includes('ref: main'));
  assert.ok(!workflow.includes('pull_request_target:'));
  assert.ok(!workflow.includes('contents: write'));
  assert.ok(!workflow.includes('git push'));
});

test('Council discovery YAML keeps its complete Bash block and no orphan top-level lines',()=>{
  const workflow=file('../.github/workflows/mel-pr-council-review.yml');
  const discover=workflow.slice(workflow.indexOf('  discover:\n'),workflow.indexOf('  preflight:\n'));
  assert.ok(discover.includes('        run: |\n          set -euo pipefail\n          META="$(gh api'));
  assert.ok(discover.includes('          IFS=
  const wf=file('../.github/workflows/mel-pr-council-review.yml');
  const preflight=wf.slice(wf.indexOf('  preflight:\n'),wf.indexOf('  review:\n'));
  const match=preflight.match(/\n    if: >-\n([\s\S]*?)\n    runs-on:/);
  assert.ok(match,'Council CI preflight must have a valid job-level guard');
  const guard=match[1].replace(/'[^']*'/g,"''");
  let depth=0;
  for(const char of guard){
    if(char==='(')depth++;
    if(char===')')depth--;
    assert.ok(depth>=0,'preflight guard closes an unopened parenthesis');
  }
  assert.equal(depth,0,'preflight guard has unclosed parenthesis and GitHub silently rejects its workflow');
  assert.match(guard,/always\(\)/);
  assert.match(guard,/needs\.discover\.outputs\.eligible/);
  assert.match(guard,/github\.event\.workflow_run\.pull_requests\[0\]\.number != null/);
});

test('no Council job can be reported as approved before exact-SHA CI passes, including manual dispatch',()=>{
  const workflow=file('../.github/workflows/mel-pr-council-review.yml');
  const preflight=workflow.slice(workflow.indexOf('  preflight:\n'),workflow.indexOf('  review:\n'));
  const review=workflow.slice(workflow.indexOf('  review:\n'));
  assert.ok(preflight.includes('id: ci_gate'));
  assert.ok(preflight.includes('GITHUB_OUTPUT'));
  assert.ok(preflight.includes("const ready=pending.length===0&&unfinished.length===0"));
  assert.ok(review.includes('needs: [discover, preflight]'));
  assert.ok(review.includes("needs.preflight.result == 'success'"));
  assert.ok(review.includes("needs.preflight.outputs.ready == 'true'"));
  assert.ok(!review.includes('id: ci_gate'),'CI gate must run in a separate preflight job');
  assert.ok(!review.includes("if: github.event_name == 'workflow_dispatch'"),
    'manual dispatch cannot bypass the mandatory CI proof');
  assert.ok(!review.includes('steps.ci_gate.outputs.ready'));
  assert.ok(review.indexOf('Full multi-batch independent Council verdict')
    <review.indexOf('Recheck immutable head and main'));
});

test('merged PR Council review uses exact original merge-parent diff and cannot authorize a release retroactively',()=>{
  const wf=file('../.github/workflows/mel-pr-council-review.yml');
  for(const required of [
    "elif [ \"$STATE\" = \"closed\" ] && [ -n \"$MERGED_AT\" ]",
    "REVIEW_KIND=\"POST_MERGE_AUDIT_ONLY\"",
    'git merge-base --is-ancestor "$MERGE_SHA" "$MAIN"',
    'git rev-list --parents -n 1 "$MERGE_SHA"',
    'test "${#PARENTS[@]}" -eq 3',
    'test "${PARENTS[2]}" = "$HEAD"',
    'BASE="${PARENTS[1]}"',
    'git diff "$MEL_COUNCIL_BASE_SHA" "$MEL_COUNCIL_HEAD_SHA"',
    "retroactive_premerge_approval:false",
    "release_authorized:false",
    "council-review-provenance.json",
  ])assert.ok(wf.includes(required),required);
  assert.ok(wf.includes('eligible=true'));
  assert.ok(wf.includes('eligible=false'));
  const postMerge=wf.slice(wf.indexOf('REVIEW_KIND="POST_MERGE_AUDIT_ONLY"'),wf.indexOf('MEL_COUNCIL_HEAD_SHA=$HEAD'));
  assert.ok(!postMerge.includes('git push'));
  assert.ok(!postMerge.includes('wrangler deploy'));
  assert.ok(!wf.includes('pull_request_target:'));
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
));
  assert.ok(discover.includes('          echo "head=$HEAD" >> "$GITHUB_OUTPUT"'));
  assert.ok(discover.includes('          echo "pr_number=3094" >> "$GITHUB_OUTPUT"'));
  assert.ok(discover.includes('          echo "Read-only Council candidate pinned to PR #3094 head: $HEAD"'));
  assert.ok(!discover.includes('set -euo p          META'));
  const run=discover.slice(discover.indexOf('        run: |\n')+'        run: |\n'.length);
  for(const line of run.split('\n').filter(Boolean))
    assert.match(line,/^ {10,}/,'every discovery shell command must stay within YAML run block');
  assert.equal(workflow.split('\n  preflight:\n').length,2,'one preflight job');
});

test('GitHub Actions preflight boolean guard is well-balanced and cannot fail workflow registration',()=>{
  const wf=file('../.github/workflows/mel-pr-council-review.yml');
  const preflight=wf.slice(wf.indexOf('  preflight:\n'),wf.indexOf('  review:\n'));
  const match=preflight.match(/\n    if: >-\n([\s\S]*?)\n    runs-on:/);
  assert.ok(match,'Council CI preflight must have a valid job-level guard');
  const guard=match[1].replace(/'[^']*'/g,"''");
  let depth=0;
  for(const char of guard){
    if(char==='(')depth++;
    if(char===')')depth--;
    assert.ok(depth>=0,'preflight guard closes an unopened parenthesis');
  }
  assert.equal(depth,0,'preflight guard has unclosed parenthesis and GitHub silently rejects its workflow');
  assert.match(guard,/always\(\)/);
  assert.match(guard,/needs\.discover\.outputs\.eligible/);
  assert.match(guard,/github\.event\.workflow_run\.pull_requests\[0\]\.number != null/);
});

test('no Council job can be reported as approved before exact-SHA CI passes, including manual dispatch',()=>{
  const workflow=file('../.github/workflows/mel-pr-council-review.yml');
  const preflight=workflow.slice(workflow.indexOf('  preflight:\n'),workflow.indexOf('  review:\n'));
  const review=workflow.slice(workflow.indexOf('  review:\n'));
  assert.ok(preflight.includes('id: ci_gate'));
  assert.ok(preflight.includes('GITHUB_OUTPUT'));
  assert.ok(preflight.includes("const ready=pending.length===0&&unfinished.length===0"));
  assert.ok(review.includes('needs: [discover, preflight]'));
  assert.ok(review.includes("needs.preflight.result == 'success'"));
  assert.ok(review.includes("needs.preflight.outputs.ready == 'true'"));
  assert.ok(!review.includes('id: ci_gate'),'CI gate must run in a separate preflight job');
  assert.ok(!review.includes("if: github.event_name == 'workflow_dispatch'"),
    'manual dispatch cannot bypass the mandatory CI proof');
  assert.ok(!review.includes('steps.ci_gate.outputs.ready'));
  assert.ok(review.indexOf('Full multi-batch independent Council verdict')
    <review.indexOf('Recheck immutable head and main'));
});

test('merged PR Council review uses exact original merge-parent diff and cannot authorize a release retroactively',()=>{
  const wf=file('../.github/workflows/mel-pr-council-review.yml');
  for(const required of [
    "elif [ \"$STATE\" = \"closed\" ] && [ -n \"$MERGED_AT\" ]",
    "REVIEW_KIND=\"POST_MERGE_AUDIT_ONLY\"",
    'git merge-base --is-ancestor "$MERGE_SHA" "$MAIN"',
    'git rev-list --parents -n 1 "$MERGE_SHA"',
    'test "${#PARENTS[@]}" -eq 3',
    'test "${PARENTS[2]}" = "$HEAD"',
    'BASE="${PARENTS[1]}"',
    'git diff "$MEL_COUNCIL_BASE_SHA" "$MEL_COUNCIL_HEAD_SHA"',
    "retroactive_premerge_approval:false",
    "release_authorized:false",
    "council-review-provenance.json",
  ])assert.ok(wf.includes(required),required);
  assert.ok(wf.includes('eligible=true'));
  assert.ok(wf.includes('eligible=false'));
  const postMerge=wf.slice(wf.indexOf('REVIEW_KIND="POST_MERGE_AUDIT_ONLY"'),wf.indexOf('MEL_COUNCIL_HEAD_SHA=$HEAD'));
  assert.ok(!postMerge.includes('git push'));
  assert.ok(!postMerge.includes('wrangler deploy'));
  assert.ok(!wf.includes('pull_request_target:'));
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
