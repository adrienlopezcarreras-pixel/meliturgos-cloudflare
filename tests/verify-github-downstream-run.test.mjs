import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyGitHubDownstreamRun } from '../scripts/verify-github-downstream-run.mjs';
import { REQUIRED_PROOFS } from '../scripts/verify-downstream-proof-attestation.mjs';
const sha='a'.repeat(40);
const evidence={schema:'mel.release.downstream-proof.v1',expected_sha:sha,github_run_id:'42',github_run_attempt:'1',verification:'seven-jobs-success',passed_jobs:[...REQUIRED_PROOFS]};
function data(){return {run:{id:42,status:'completed',conclusion:'success',name:'release-downstream-proof-decoupled',event:'workflow_dispatch',run_attempt:1},jobs:{total_count:8,jobs:[...REQUIRED_PROOFS,'summary'].map(name=>({name,status:'completed',conclusion:'success'}))}};}
async function check(modify=()=>{}){const d=data();modify(d);return verifyGitHubDownstreamRun(evidence,{owner:'example',repo:'mel',expectedSha:sha,token:'test',fetchImpl:async uri=>({ok:true,json:async()=>uri.includes('/jobs?')?d.jobs:d.run})});}
test('GitHub attestation requires every verified job and matching run',async()=>{
  assert.equal((await check()).verified,true);
  await assert.rejects(check(d=>d.jobs.jobs.find(j=>j.name==='skills').conclusion='failure'),/GITHUB_PROOF_JOB_NOT_SUCCESSFUL/);
  await assert.rejects(check(d=>d.jobs.jobs.find(j=>j.name==='summary').conclusion='failure'),/GITHUB_PROOF_SUMMARY_NOT_SUCCESSFUL/);
  await assert.rejects(check(d=>d.run.run_attempt=2),/GITHUB_PROOF_ATTEMPT_MISMATCH/);
  await assert.rejects(check(d=>d.jobs.total_count=101),/GITHUB_PROOF_JOBS_INCOMPLETE/);
  await assert.rejects(check(d=>d.run.event='push'),/GITHUB_PROOF_TRIGGER_INVALID/);
});
