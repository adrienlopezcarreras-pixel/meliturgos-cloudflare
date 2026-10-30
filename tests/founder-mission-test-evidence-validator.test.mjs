import test from 'node:test';
import assert from 'node:assert/strict';
import { validateFounderMissionTestEvidence as validate } from '../src/evolution/founder-mission-test-evidence.js';

const sha = 'a'.repeat(40), id = 123;
const names = [
  'a completed connected read replays its archived response without any model, provider or archive duplicate',
  'a partial turn and another conversation cannot be mistaken for a completed read receipt',
  'a completed connected read lookup failure stops before models and providers',
];
const run = { id, name:'full-candidate-ci', head_branch:'candidate/mel-clean-autonomy', head_sha:sha, status:'completed', conclusion:'success' };
const receipt = { schema:'MEL_FOUNDER_MISSION_TEST_EVIDENCE_V1', source:'full-candidate-ci/full-suite',
  candidate_sha:sha, github_run_id:id, github_run_attempt:1, log_sha256:'b'.repeat(64),
  exit_code:0, mandatory_tests_verified:true, tests:names.map(name=>({name,passed:true})),
  additional_required_proofs:['GMAIL_CALENDAR_DRIVE_TYPED_AUTH','NO_RAW_TOOL_CALL_JSON'] };
test('rejects stale run and SHA substitution', () => {
  assert.equal(validate(receipt, {...run,head_sha:'c'.repeat(40)}, {candidateSha:sha,runId:id}).code, 'MISSION_TEST_RUN_MISMATCH');
  assert.equal(validate(receipt, run, {candidateSha:'c'.repeat(40),runId:id}).ok, false);
  // A receipt claiming a later attempt than the run is forged; one from an
  // earlier attempt of the same run (failed-jobs re-run) is the real artifact.
  assert.equal(validate({...receipt,github_run_attempt:3}, {...run,run_attempt:2}, {candidateSha:sha,runId:id}).code, 'MISSION_TEST_RECEIPT_INVALID');
  assert.notEqual(validate(receipt, {...run,run_attempt:2}, {candidateSha:sha,runId:id}).code, 'MISSION_TEST_RECEIPT_INVALID');
  assert.equal(validate(receipt, {...run,conclusion:'failure'}, {candidateSha:sha,runId:id}).ok, false);
});
test('rejects missing mandatory cases or an unproven mission requirement', () => {
  assert.equal(validate(receipt,run,{candidateSha:sha,runId:id}).code,'MISSION_TEST_ADDITIONAL_PROOFS_REQUIRED');
  assert.equal(validate({...receipt,additional_required_proofs:[]},run,{candidateSha:sha,runId:id}).code,'MISSION_TEST_ADDITIONAL_PROOFS_REQUIRED');
  assert.equal(validate({...receipt,tests:receipt.tests.slice(1),additional_required_proofs:[]},run,{candidateSha:sha,runId:id}).code,'MISSION_TEST_REQUIRED_CASES_MISSING');
});


test('accepts a complete exact-run receipt with all named auth and rendering proofs', () => {
  const additional = [
    'Gmail missing authorization does not inherit the last Google Tasks token error',
    'missing Calendar grant reports a typed auth diagnostic without network calls',
    'missing Drive grant reports a typed auth diagnostic without network calls',
    'a completed connected tool response renders human text instead of raw tool-call JSON',
  ];
  const complete = {...receipt, tests:[...receipt.tests, ...additional.map(name=>({name,passed:true}))], additional_required_proofs:[]};
  assert.equal(validate(complete, run, {candidateSha:sha,runId:id}).ok, true);
  assert.equal(validate({...complete,tests:complete.tests.slice(0,-1)},run,{candidateSha:sha,runId:id}).code,'MISSION_TEST_ADDITIONAL_PROOFS_REQUIRED');
});
