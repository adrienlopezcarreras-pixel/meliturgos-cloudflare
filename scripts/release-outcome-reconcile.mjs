import { releaseOutcomeComment } from './release-outcome-ledger.mjs';
import { pathToFileURL } from 'node:url';

const REPO='adrienlopezcarreras-pixel/meliturgos-cloudflare';
const ISSUE=1516;
const API='https://api.github.com/repos/'+REPO;
const approvedRun=run=>run?.status==='completed'
 && run?.name==='deploy-cloudflare-release'
 && run?.repository?.full_name===REPO
 && run?.head_repository?.full_name===REPO
 && ((run.event==='push' && run.head_branch==='release/mel-hardware-v0.1.0')
   || (run.event==='workflow_dispatch' && ['main','release/mel-hardware-v0.1.0'].includes(run.head_branch)));

export async function reconcileReleaseOutcomes({
 token,fetchImpl=fetch,repository=REPO,limit=12
}={}){
 if(repository!==REPO)throw new Error('RELEASE_RECONCILE_REPOSITORY_INVALID');
 if(typeof token!=='string'||token.length<5)throw new Error('RELEASE_RECONCILE_TOKEN_MISSING');
 if(!Number.isInteger(limit)||limit<1||limit>25)throw new Error('RELEASE_RECONCILE_LIMIT_INVALID');
 const headers={
  Authorization:'Bearer '+token,
  Accept:'application/vnd.github+json',
  'X-GitHub-Api-Version':'2022-11-28'
 };
 async function call(path,method='GET',body){
  const response=await fetchImpl(API+path,{
   method,headers:{...headers,...(body===undefined?{}:{'content-type':'application/json'})},
   ...(body===undefined?{}:{body:JSON.stringify(body)})
  });
  if(!response?.ok){
   // The ledger target is a merged PR, not an ordinary issue. Do not hide
   // authorization failures or report an unrecorded release as reconciled.
   if(method==='POST' && response?.status===403)
    throw new Error('RELEASE_RECONCILE_PR_COMMENT_FORBIDDEN_403');
   throw new Error('RELEASE_RECONCILE_GITHUB_API_FAILED_'+method+'_'+response?.status);
  }
  return response.status===204?null:response.json();
 }
 const queried=await call('/actions/workflows/deploy-cloudflare-release.yml/runs?per_page=50&status=completed');
 if(!Array.isArray(queried?.workflow_runs))throw new Error('RELEASE_RECONCILE_RUNS_INVALID');
 const candidates=queried.workflow_runs.filter(approvedRun).slice(0,limit);
 if(!candidates.length)return {checked:0,created:0,skipped:0};
 // Validate every run before any issue comment is written: one malformed
 // GitHub result must never leave a half-written batch.
 const receipts=candidates.map(run=>({
  url:'https://github.com/'+REPO+'/actions/runs/'+run.id,
  comment:releaseOutcomeComment({action:'completed',workflow_run:run},REPO),
 }));
 const existing=[];
 let ended=false;
 for(let page=1;page<=5;page++){
  const comments=await call('/issues/'+ISSUE+'/comments?per_page=100&page='+page);
  if(!Array.isArray(comments))throw new Error('RELEASE_RECONCILE_COMMENTS_INVALID');
  existing.push(...comments.map(x=>String(x?.body||'')));
  if(comments.length<100){ended=true;break;}
 }
 if(!ended)throw new Error('RELEASE_RECONCILE_COMMENTS_UNBOUNDED');
 let created=0,skipped=0;
 for(const receipt of [...receipts].reverse()){
  if(existing.some(body=>body.includes(receipt.url))){skipped++;continue;}
  await call('/issues/'+ISSUE+'/comments','POST',{body:receipt.comment});
  existing.push(receipt.comment);
  created++;
 }
 return {checked:candidates.length,created,skipped};
}

if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href){
 const result=await reconcileReleaseOutcomes({
  token:process.env.GH_TOKEN,
  repository:process.env.GITHUB_REPOSITORY
 });
 console.log(JSON.stringify(result));
}
