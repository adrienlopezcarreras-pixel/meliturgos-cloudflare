import test from 'node:test';
import assert from 'node:assert/strict';
import { screenTaskmarketTask } from '../../src/revenue/taskmarket-task-policy.js';
const task = { id:'0xabc', status:'open', description:'Transform this public JSON dataset and provide the normalized output file.', reward:'1000000', platformFeeBps:750, mode:'bounty', stakeRequired:false, claimedBy:null, expiryTime:new Date(Date.now()+3600000).toISOString() };
const assessment = { category:'data-processing', machineVerifiable:true, requiresHuman:false, requiresPhysicalWorld:false, requiresHostSecrets:false, requiresUnsafeAction:false, confidenceBps:9500, estimatedComputeCostMicros:100000 };
const policy = { minimumConfidenceBps:8500, minimumProfitMicros:100000, minimumMarginBps:1000, automaticSubmissionEnabled:false, legalBundleReviewed:false, workerIdentityReady:false, outputValidatorVerified:false };
test('screens a profitable explicitly unclaimed, no-stake task in observation-only mode',()=>{
  const x=screenTaskmarketTask(task,assessment,policy);
  assert.equal(x.decision,'OBSERVE_ONLY');
  assert.equal(x.grossRewardMicros,1000000);
  assert.equal(x.netRewardMicros,925000);
  assert.equal(x.expectedProfitMicros,825000);
});
test('rejects non-open and claimed tasks',()=>{
  assert.equal(screenTaskmarketTask({...task,status:'completed'},assessment,policy).reason,'TASK_NOT_OPEN');
  assert.equal(screenTaskmarketTask({...task,claimedBy:'0xworker'},assessment,policy).reason,'TASK_ALREADY_CLAIMED');
});
test('rejects unknown claim/stake state and tasks requiring stake',()=>{
  assert.equal(screenTaskmarketTask({...task,claimedBy:undefined},assessment,policy).reason,'CLAIM_STATUS_UNVERIFIED');
  assert.equal(screenTaskmarketTask({...task,stakeRequired:undefined},assessment,policy).reason,'STAKE_REQUIREMENT_UNVERIFIED');
  assert.equal(screenTaskmarketTask({...task,stakeRequired:true},assessment,policy).reason,'STAKE_REQUIRED');
});
test('blocks modes that require separate claim/auction lifecycle wiring',()=>{
  assert.equal(screenTaskmarketTask({...task,mode:'claim'},assessment,policy).reason,'TASK_MODE_NOT_ALLOWED');
  assert.equal(screenTaskmarketTask({...task,mode:'auction'},assessment,policy).reason,'TASK_MODE_NOT_ALLOWED');
});
test('rejects human or physical tasks',()=>{
  assert.equal(screenTaskmarketTask(task,{...assessment,requiresHuman:true},policy).reason,'HUMAN_WORK_REQUIRED');
  assert.equal(screenTaskmarketTask(task,{...assessment,requiresPhysicalWorld:true},policy).reason,'PHYSICAL_WORLD_WORK_REQUIRED');
});
test('rejects unknown/unsafe tasks',()=>{
  assert.equal(screenTaskmarketTask(task,{...assessment,category:'marketing'},policy).reason,'CATEGORY_NOT_ALLOWLISTED');
  assert.equal(screenTaskmarketTask(task,{...assessment,requiresHostSecrets:true},policy).reason,'UNSAFE_OR_SECRET_ACCESS_REQUIRED');
});
test('rejects unverified acceptance criteria',()=>assert.equal(screenTaskmarketTask(task,{...assessment,machineVerifiable:false},policy).reason,'ACCEPTANCE_NOT_MACHINE_VERIFIABLE'));
test('does not submit until legal setup and validation are verified',()=>{
  const enabled={...policy,automaticSubmissionEnabled:true};
  assert.equal(screenTaskmarketTask(task,assessment,enabled).reason,'OPERATOR_SETUP_NOT_CONFIRMED');
  assert.equal(screenTaskmarketTask(task,assessment,{...enabled,legalBundleReviewed:true,workerIdentityReady:true,outputValidatorVerified:true}).decision,'ELIGIBLE_FOR_SUBMISSION');
});
test('rejects negative economics',()=>assert.equal(screenTaskmarketTask(task,{...assessment,estimatedComputeCostMicros:950000},policy).reason,'EXPECTED_PROFIT_TOO_LOW'));
