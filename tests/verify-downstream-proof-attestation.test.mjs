import test from 'node:test';
import assert from 'node:assert/strict';
import { REQUIRED_PROOFS, verifyDownstreamProofAttestation } from '../scripts/verify-downstream-proof-attestation.mjs';

const sha='a'.repeat(40);
function valid() { return { schema:'mel.release.downstream-proof.v1',expected_sha:sha,github_run_id:'12345',github_run_attempt:'1',verification:'seven-jobs-success',passed_jobs:[...REQUIRED_PROOFS] }; }
test('attestation requires exact SHA, exact run and seven distinct proofs', () => {
  assert.equal(verifyDownstreamProofAttestation(valid(),{expectedSha:sha,runId:'12345'}).verified,true);
  for (const change of [
    v=>v.expected_sha='b'.repeat(40),
    v=>v.github_run_id='12346',
    v=>v.github_run_attempt='0',
    v=>v.verification='partial',
    v=>v.passed_jobs.pop(),
    v=>v.passed_jobs[1]=v.passed_jobs[0],
    v=>v.schema='other',
  ]) {
    const item=valid();change(item);
    assert.throws(()=>verifyDownstreamProofAttestation(item,{expectedSha:sha,runId:'12345'}));
  }
});
