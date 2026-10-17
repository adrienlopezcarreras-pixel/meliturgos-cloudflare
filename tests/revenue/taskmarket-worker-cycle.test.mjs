import test from 'node:test';
import assert from 'node:assert/strict';
import { runTaskmarketWorkerCycle, feedbackToLoraCandidate, createD1ValidatedDraftAdapter, runTaskmarketWorkerCycleWithD1, listD1ValidatedDrafts, createPublicTaskmarketListAdapter, createTaskmarketCouncilAssessmentAdapter } from '../../src/revenue/taskmarket-worker-cycle.js';

const task = {
  id: '0x123',
  status: 'open',
  description: 'Normalize this provided JSON dataset into the requested schema.',
  reward: '1000000',
  platformFeeBps: 750,
  mode: 'bounty',
  stakeRequired: false,
  claimedBy: null,
  expiryTime: new Date(Date.now() + 3600000).toISOString(),
};
const base = {
  listTasks: async () => ({ tasks: [task] }),
  assessWithCouncil: async () => ({
    eligible: true,
    confidenceBps: 9500,
    category: 'data-processing',
    machineVerifiable: true,
    requiresHuman: false,
    requiresPhysicalWorld: false,
    requiresSecrets: false,
    requestsUnsafeAction: false,
    estimatedComputeCostMicros: 100000,
  }),
  solveWithMel: async () => ({ content: '{}' }),
  validateWithCouncil: async () => ({ passed: true, machineVerifiable: true, summary: 'schema-valid' }),
  recordOutcome: async () => {},
  policy: { minimumProfitMicros: 100000, minimumMarginBps: 1000 },
};

test('validates work but does not submit while gates are closed', async () => {
  let submits = 0;
  const r = await runTaskmarketWorkerCycle({ ...base, submitResult: async () => { submits++; return { success: true, submissionId: 's1' }; } });
  assert.equal(r.decisions[0].status, 'READY_NOT_SUBMITTED');
  assert.equal(r.decisions[0].reason, 'AUTOMATIC_SUBMISSION_DISABLED');
  assert.equal(r.decisions[0].economics.expectedProfitMicros, 825000);
  assert.equal(submits, 0);
});

test('skips low-confidence Council assessments', async () => {
  const r = await runTaskmarketWorkerCycle({ ...base, assessWithCouncil: async () => ({ eligible: true, confidenceBps: 5000 }) });
  assert.equal(r.decisions[0].reason, 'COUNCIL_DID_NOT_APPROVE');
});

test('refuses unvalidated model output', async () => {
  const r = await runTaskmarketWorkerCycle({ ...base, validateWithCouncil: async () => ({ passed: false, machineVerifiable: false }) });
  assert.equal(r.decisions[0].reason, 'OUTPUT_VALIDATION_FAILED');
});

test('loss-making candidate never reaches the submit adapter even with the other gates open', async () => {
  let submits = 0;
  const r = await runTaskmarketWorkerCycle({
    ...base,
    assessWithCouncil: async () => ({ ...await base.assessWithCouncil(), estimatedComputeCostMicros: 950000 }),
    policy: { minimumProfitMicros: 100000, minimumMarginBps: 1000, submissionEnabled: true, legalAccepted: true, workerIdentityReady: true, outputValidatorVerified: true, spendCapApproved: true },
    submitResult: async () => { submits++; return { success: true, submissionId: 's1' }; },
  });
  assert.equal(r.decisions[0].status, 'REJECTED');
  assert.equal(r.decisions[0].reason, 'TASK_POLICY_EXPECTED_PROFIT_TOO_LOW');
  assert.equal(submits, 0);
});

test('profitable candidate still cannot submit without independent validator implementation approval', async () => {
  let submits = 0;
  const r = await runTaskmarketWorkerCycle({
    ...base,
    policy: { minimumProfitMicros: 100000, minimumMarginBps: 1000, submissionEnabled: true, legalAccepted: true, workerIdentityReady: true, spendCapApproved: true, outputValidatorVerified: false },
    submitResult: async () => { submits++; return { success: true, submissionId: 's1' }; },
  });
  assert.equal(r.decisions[0].status, 'REJECTED');
  assert.equal(r.decisions[0].reason, 'TASK_POLICY_OUTPUT_VALIDATOR_NOT_VERIFIED');
  assert.equal(submits, 0);
});

test('does not submit until legal setup and validation are verified', async () => {
  let submits = 0;
  const r = await runTaskmarketWorkerCycle({
    ...base,
    policy: { minimumProfitMicros: 100000, minimumMarginBps: 1000, submissionEnabled: true },
    submitResult: async () => { submits++; return { success: true, submissionId: 's1' }; },
  });
  assert.equal(r.decisions[0].status, 'REJECTED');
  assert.equal(r.decisions[0].reason, 'TASK_POLICY_OPERATOR_SETUP_NOT_CONFIRMED');
  assert.equal(submits, 0);
});

test('submits only with all setup, economics and spending gates explicitly enabled', async () => {
  let payload;
  const r = await runTaskmarketWorkerCycle({
    ...base,
    policy: { minimumProfitMicros: 100000, minimumMarginBps: 1000, submissionEnabled: true, legalAccepted: true, workerIdentityReady: true, outputValidatorVerified: true, spendCapApproved: true },
    submitResult: async (x) => { payload = x; return { success: true, submissionId: 's1' }; },
  });
  assert.equal(r.submitted, 1);
  assert.equal(r.decisions[0].status, 'SUBMITTED_PENDING_ACCEPTANCE');
  assert.equal(payload.task.id, '0x123');
  assert.equal(payload.economics.expectedProfitMicros, 825000);
  assert.equal(r.incomeStatus, 'NOT_SETTLED_UNTIL_ACCEPTED_AND_PAID');
});

test('unknown stake or claim state cannot reach the submission adapter', async () => {
  const fullPolicy = { minimumProfitMicros: 100000, minimumMarginBps: 1000, submissionEnabled: true, legalAccepted: true, workerIdentityReady: true, outputValidatorVerified: true, spendCapApproved: true };
  for (const [field, expectedReason] of [['stakeRequired', 'TASK_POLICY_STAKE_REQUIREMENT_UNVERIFIED'], ['claimedBy', 'TASK_POLICY_CLAIM_STATUS_UNVERIFIED']]) {
    const unknown = { ...task };
    delete unknown[field];
    let submits = 0;
    const r = await runTaskmarketWorkerCycle({
      ...base,
      listTasks: async () => ({ tasks: [unknown] }),
      policy: fullPolicy,
      submitResult: async () => { submits++; return { success: true, submissionId: 's1' }; },
    });
    assert.equal(r.decisions[0].status, 'REJECTED');
    assert.equal(r.decisions[0].reason, expectedReason);
    assert.equal(submits, 0);
  }
});

test('only turns accepted and settled real feedback into a review-required LoRA candidate', () => {
  const evidence = { taskId: '0x123', candidateSha256: 'b'.repeat(64) };
  assert.equal(feedbackToLoraCandidate({ status: 'rejected', payoutSettled: false, rating: 30 }, evidence), null);
  const x = feedbackToLoraCandidate({ status: 'accepted', payoutSettled: true, rating: 93, feedbackText: 'Good' }, evidence);
  assert.equal(x.trainingStatus, 'REVIEW_REQUIRED');
  assert.equal(x.rating, 93);
});


test('persists a validated draft without submitting when financial gates are closed',async()=>{
 let submits=0;let stored=null;
 const result=await runTaskmarketWorkerCycle({...base,persistValidatedDraft:async draft=>{stored=draft;return {draftId:'local-draft-123'}},submitResult:async()=>{submits++;throw new Error('unexpected submission')}});
 assert.equal(submits,0);
 assert.equal(stored.content,'{}');
 assert.equal(result.decisions[0].status,'READY_NOT_SUBMITTED');
 assert.equal(result.decisions[0].draftId,'local-draft-123');
});

test('never claims a durable draft exists when persistence is unconfirmed',async()=>{
 const result=await runTaskmarketWorkerCycle({...base,persistValidatedDraft:async()=>({})});
 assert.equal(result.decisions[0].status,'ERROR');
 assert.equal(result.decisions[0].reason,'WORK_DRAFT_PERSISTENCE_UNCONFIRMED');
});

test('D1 validated draft adapter confirms stored evidence before returning an id',async()=>{
 const calls=[];let inserted=false;let savedDraftId=null;
 const db={prepare(sql){calls.push(sql);return {bind(...values){if(sql.startsWith('INSERT'))savedDraftId=values[0];return {run:async()=>{inserted=true;return {success:true}},first:async()=>inserted?{id:calls.find(x=>x.startsWith('SELECT'))?savedDraftId:null}:null}},run:async()=>({success:true})}}};
 const save=createD1ValidatedDraftAdapter(db);
 const stored=await save({taskId:'0x123',content:'verified sample',candidateSha256:'a'.repeat(64),validation:'schema-valid'});
 assert.match(stored.draftId,/^melwork-draft-[0-9a-f]+-a{64}$/);
 assert.equal(calls.length,3);
});
test('D1 validated draft adapter never fabricates persistence confirmation',async()=>{
 const db={prepare(sql){return {bind(){return {run:async()=>({success:true}),first:async()=>null}},run:async()=>({success:true})}}};
 await assert.rejects(createD1ValidatedDraftAdapter(db)({taskId:'0x123',content:'verified sample',candidateSha256:'a'.repeat(64)}),/WORK_DRAFT_PERSISTENCE_UNCONFIRMED/);
});


test('D1 draft IDs differ across tasks for the same candidate hash',async()=>{
 const ids=[];
 const db={prepare(sql){return {run:async()=>({success:true}),bind(...values){if(sql.startsWith('INSERT'))ids.push(values[0]);return {run:async()=>({success:true}),first:async()=>({id:ids.at(-1)})}}}}};
 const save=createD1ValidatedDraftAdapter(db);
 const a=await save({taskId:'task-a',content:'draft',candidateSha256:'a'.repeat(64)});
 const b=await save({taskId:'task-b',content:'draft',candidateSha256:'a'.repeat(64)});
 assert.notEqual(a.draftId,b.draftId);
});


test('D1-backed cycle persists a validated draft without submitting it',async()=>{
 let insertedId=null;let submits=0;
 const db={prepare(sql){return {run:async()=>({success:true}),bind(...values){if(sql.startsWith('INSERT'))insertedId=values[0];return {run:async()=>({success:true}),first:async()=>({id:insertedId})}}}}};
 const result=await runTaskmarketWorkerCycleWithD1({...base,db,submitResult:async()=>{submits++;throw new Error('must not submit')}});
 assert.equal(result.decisions[0].status,'READY_NOT_SUBMITTED');
 assert.equal(result.decisions[0].draftId,insertedId);
 assert.equal(submits,0);
});


test('D1 listing returns bounded metadata without confidential draft bodies',async()=>{
 let requestedLimit;
 const db={prepare(){return {run:async()=>({success:true}),bind(limit){requestedLimit=limit;return {all:async()=>({results:[{id:'draft1',task_id:'task1',candidate_sha256:'a'.repeat(64),validation:'OK',created_at:'2026-10-17',content:'PRIVATE'}]})}}}}};
 const result=await listD1ValidatedDrafts(db,{limit:999});
 assert.equal(requestedLimit,50);
 assert.equal(result.drafts[0].taskId,'task1');
 assert.equal('content' in result.drafts[0],false);
});


test('D1 draft listing initializes an empty database before the first stored work',async()=>{
 const statements=[];
 const db={prepare(sql){statements.push(sql);return {run:async()=>({success:true}),bind(){return {all:async()=>({results:[]})}}}}};
 const output=await listD1ValidatedDrafts(db);
 assert.deepEqual(output.drafts,[]);
 assert.match(statements[0],/^CREATE TABLE IF NOT EXISTS mel_work_validated_drafts/);
 assert.match(statements[1],/^SELECT id, task_id/);
});

test('public Taskmarket discovery supplies only normalized open offers to cycle',async()=>{
 let seenUrl;let seenMethod;
 const list=createPublicTaskmarketListAdapter({
  now:()=>Date.parse('2026-10-17T00:00:00Z'),
  fetchImpl:async(url,opts)=>{
   seenUrl=url;seenMethod=opts.method;
   return {ok:true,json:async()=>({tasks:[
    {id:'job1',status:'open',description:'safe code audit',reward:'1200000',expiryTime:'2026-11-01T00:00:00Z'},
    {id:'job2',status:'closed',description:'closed',reward:'1000',expiryTime:'2026-11-01T00:00:00Z'},
   ]})};
  },
 });
 const result=await list();
 assert.equal(seenMethod,'GET');
 assert.match(seenUrl,/status=open/);
 assert.equal(result.tasks.length,1);
 assert.equal(result.tasks[0].id,'job1');
});
test('public Taskmarket discovery refuses malformed upstream payload',async()=>{
 const list=createPublicTaskmarketListAdapter({fetchImpl:async()=>({ok:true,json:async()=>({tasks:null})})});
 await assert.rejects(list(),/TASKMARKET_PUBLIC_SCHEMA_INVALID/);
});

test('rejects a solver-supplied hash that disagrees with actual content',async()=>{
 const r=await runTaskmarketWorkerCycle({...base,solveWithMel:async()=>({content:'{}',sha256:'a'.repeat(64)})});
 assert.equal(r.decisions[0].reason,'CANDIDATE_HASH_MISMATCH');
});

test('Council Taskmarket assessment accepts only complete independent structured assessments',async()=>{
 const content={eligible:true,confidenceBps:9500,category:'data',requiresHuman:false,requiresPhysicalWorld:false,requiresSecrets:false,requestsUnsafeAction:false,estimatedComputeCostMicros:12000};
 const assess=createTaskmarketCouncilAssessmentAdapter({council:async()=>({status:'COMPLETE',independent_response_count:2,synthesis:{text:JSON.stringify(content)}})});
 assert.equal((await assess({task,untrustedDescription:task.description})).eligible,true);
 const degraded=createTaskmarketCouncilAssessmentAdapter({council:async()=>({status:'DEGRADED_SINGLE_MODEL',independent_response_count:1,synthesis:{text:JSON.stringify(content)}})});
 await assert.rejects(degraded({task}),/WORK_COUNCIL_INDEPENDENCE_NOT_PROVEN/);
 const malformed=createTaskmarketCouncilAssessmentAdapter({council:async()=>({status:'COMPLETE',independent_response_count:2,synthesis:{text:'not json'}})});
 await assert.rejects(malformed({task}),/WORK_COUNCIL_ASSESSMENT_INVALID/);
});
