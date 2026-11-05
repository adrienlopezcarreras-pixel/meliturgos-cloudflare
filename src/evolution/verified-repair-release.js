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
  const denied=()=>({ok:false,status:'REPAIR_RELEASE_HEALTH_UNPROVEN'});
  const identity=oidc?.identity;
  if(oidc?.ok!==true || identity?.ok!==true || identity.repository!==REPOSITORY || identity.sha!==deployedSha
      || !/^[a-f0-9]{40}$/.test(String(deployedSha||''))
      || !Number.isSafeInteger(identity.run_id) || identity.run_id<=0 || !token) return denied();
  const read=async suffix=>{
    const response=await fetchImpl(`https://api.github.com/repos/${REPOSITORY}/actions/runs/${identity.run_id}${suffix}`,{
      redirect:'error', signal:AbortSignal.timeout(15000),
      headers:{accept:'application/vnd.github+json',authorization:`Bearer ${token}`,'user-agent':'MEL-verified-repair-release'},
    });
    if(!response.ok)throw new Error('REPAIR_RELEASE_READ_FAILED');
    return response.json();
  };
  try {
    const run=await read('');
    if(run.id!==identity.run_id || run.head_sha!==deployedSha || run.repository?.full_name!==REPOSITORY
        || run.path!=='.github/workflows/deploy-cloudflare-release.yml'
        || !['push','workflow_dispatch'].includes(run.event)) return denied();
    const page=await read('/jobs?per_page=100');
    const jobs=page.jobs;
    if(!Array.isArray(jobs) || page.total_count!==jobs.length) return denied();
    if(!REPAIR_RELEASE_GATES.every(name=>jobs.some(job=>job.name===name && job.status==='completed' && job.conclusion==='success'))) return denied();
    if(jobs.some(job=>job.name!=='resume-verified-repair'
      && (job.status!=='completed' || !['success','skipped'].includes(job.conclusion))))return denied();
    return {ok:true,status:'REPAIR_RELEASE_HEALTH_VERIFIED',run_id:run.id,sha:deployedSha};
  }catch{return denied();}
}
