import { verifyDownstreamProofAttestation, REQUIRED_PROOFS } from './verify-downstream-proof-attestation.mjs';

export async function verifyGitHubDownstreamRun(attestation,{owner,repo,expectedSha,token,fetchImpl=fetch}={}) {
  const identity=verifyDownstreamProofAttestation(attestation,{expectedSha});
  if(!/^[a-zA-Z0-9_.-]+$/.test(String(owner||''))||!/^[a-zA-Z0-9_.-]+$/.test(String(repo||''))) throw new Error('GITHUB_REPOSITORY_INVALID');
  if(!token) throw new Error('GITHUB_API_TOKEN_REQUIRED');
  const request=async path=>{
    const response=await fetchImpl('https://api.github.com/repos/'+owner+'/'+repo+path,{
      headers:{authorization:'Bearer '+token,accept:'application/vnd.github+json','x-github-api-version':'2022-11-28'}
    });
    if(!response.ok) throw new Error('GITHUB_PROOF_REQUEST_FAILED:'+response.status);
    return response.json();
  };
  const id=identity.github_run_id;
  const run=await request('/actions/runs/'+id);
  if(run.id!==Number(id)||run.status!=='completed'||run.conclusion!=='success') throw new Error('GITHUB_PROOF_RUN_NOT_SUCCESSFUL');
  if(!String(run.path||'').endsWith('/release-downstream-proof-decoupled.yml') &&
     String(run.name||'')!=='release-downstream-proof-decoupled') throw new Error('GITHUB_PROOF_WORKFLOW_MISMATCH');
  if(run.event!=='workflow_dispatch') throw new Error('GITHUB_PROOF_TRIGGER_INVALID');
  if(Number(run.run_attempt)!==Number(attestation.github_run_attempt)) throw new Error('GITHUB_PROOF_ATTEMPT_MISMATCH');
  const jobs=await request('/actions/runs/'+id+'/jobs?per_page=100');
  if(!Array.isArray(jobs.jobs)||jobs.total_count>100) throw new Error('GITHUB_PROOF_JOBS_INCOMPLETE');
  const final=jobs.jobs.filter(j=>j.name==='summary');
  if(final.length!==1||final[0].status!=='completed'||final[0].conclusion!=='success') throw new Error('GITHUB_PROOF_SUMMARY_NOT_SUCCESSFUL');
  for(const name of REQUIRED_PROOFS) {
    const matching=jobs.jobs.filter(j=>j.name===name);
    if(matching.length!==1||matching[0].status!=='completed'||matching[0].conclusion!=='success') throw new Error('GITHUB_PROOF_JOB_NOT_SUCCESSFUL:'+name);
  }
  return {verified:true,expected_sha:identity.expected_sha,github_run_id:id};
}
