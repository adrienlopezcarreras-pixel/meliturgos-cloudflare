import { readRepairGitHubJson } from './repair-github-json.js';
// Read-only verification of the *current* canonical release. The caller must
// authenticate GitHub OIDC before supplying its ephemeral read-only token.
const REPOSITORY = 'adrienlopezcarreras-pixel/meliturgos-cloudflare';
export const REPAIR_RELEASE_GATES = Object.freeze([
  'deploy',
  'post-release-health-gate / resolve',
  'post-release-health-gate / platform / activate-and-prove',
  'post-release-health-gate / connections / production-proof',
  'post-release-health-gate / workers-ai-proof-refresh / refresh',
  'post-release-health-gate / summary',
]);
export async function verifyRepairRelease({oidc, deployedSha, token, fetchImpl=fetch}={}) {
  const denied=reason=>({ok:false,status:'REPAIR_RELEASE_HEALTH_UNPROVEN',reason});
  const identity=oidc?.identity;
  if(oidc?.ok!==true || identity?.ok!==true || identity.repository!==REPOSITORY || identity.sha!==deployedSha
      || !/^[a-f0-9]{40}$/.test(String(deployedSha||''))
      || !Number.isSafeInteger(identity.run_id) || identity.run_id<=0 || !token) return denied('IDENTITY_OR_TOKEN_INVALID');
  const read=async (suffix,stage)=>{
    const result=await readRepairGitHubJson(`actions/runs/${identity.run_id}${suffix}`,{token,fetchImpl});
    if(!result.ok)throw new Error(`${stage}_${result.code}`);
    return result.data;
  };
  try {
    const run=await read('','RUN');
    if(run.id!==identity.run_id || run.head_sha!==deployedSha || run.repository?.full_name!==REPOSITORY
        || run.path!=='.github/workflows/deploy-cloudflare-release.yml'
        || !['push','workflow_dispatch'].includes(run.event)) return denied('RUN_METADATA_MISMATCH');
    const page=await read('/jobs?per_page=100','JOBS');
    const jobs=page.jobs;
    if(!Array.isArray(jobs) || page.total_count!==jobs.length) return denied('JOBS_INCOMPLETE');
    if(!REPAIR_RELEASE_GATES.every(name=>jobs.some(job=>job.name===name && job.status==='completed' && job.conclusion==='success'))) return denied('HEALTH_GATE_NOT_SUCCESSFUL');
    if(jobs.some(job=>job.name!=='resume-verified-repair'
      && (job.status!=='completed' || !['success','skipped'].includes(job.conclusion))))return denied('OTHER_JOB_NOT_SUCCESSFUL');
    return {ok:true,status:'REPAIR_RELEASE_HEALTH_VERIFIED',run_id:run.id,sha:deployedSha};
  }catch(error){
    const code=String(error?.message||'');
    return denied(/^(RUN|JOBS)_(FETCH_FAILED|JSON_INVALID|HTTP_[0-9]{1,3})$/.test(code) ? code : 'GITHUB_READ_UNAVAILABLE');
  }
}
