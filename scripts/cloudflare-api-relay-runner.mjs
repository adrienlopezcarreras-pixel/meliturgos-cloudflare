const BASE_URL=String(process.env.MEL_RELAY_BASE_URL||'https://meliturgos.adrien-lopezcarreras.workers.dev').replace(/\/$/,'');
const OIDC_TOKEN=String(process.env.MEL_CLOUDFLARE_RELAY_OIDC||'');
const CF_TOKEN=String(process.env.CLOUDFLARE_API_TOKEN||'');
const ACCOUNT_ID=String(process.env.CLOUDFLARE_ACCOUNT_ID||'');
function assert(v,c){if(!v)throw Object.assign(new Error(c),{code:c});}
async function worker(path,body={}){
  const r=await fetch(BASE_URL+path,{method:'POST',headers:{'x-mel-github-oidc':OIDC_TOKEN,'content-type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(60000)});
  const t=await r.text();let d={};try{d=t?JSON.parse(t):{}}catch{}
  if(!r.ok||d?.ok===false)throw Object.assign(new Error(d?.code||'CLOUDFLARE_RELAY_WORKER_REQUEST_FAILED'),{code:d?.code||'CLOUDFLARE_RELAY_WORKER_REQUEST_FAILED',status:r.status});
  return d;
}
async function cf(path){
  const r=await fetch('https://api.cloudflare.com/client/v4'+path,{headers:{authorization:'Bearer '+CF_TOKEN,accept:'application/json'},signal:AbortSignal.timeout(60000)});
  const t=await r.text();let d={};try{d=t?JSON.parse(t):{}}catch{}
  if(!r.ok||d?.success===false)throw Object.assign(new Error('CLOUDFLARE_RELAY_UPSTREAM_FAILED'),{code:'CLOUDFLARE_RELAY_UPSTREAM_FAILED',status:r.status});
  return d;
}
function cleanWorkers(body,limit){
  return (Array.isArray(body?.result)?body.result:[]).slice(0,limit).map(row=>({
    id:String(row?.id||''),created_on:String(row?.created_on||''),modified_on:String(row?.modified_on||''),
    compatibility_date:String(row?.compatibility_date||''),usage_model:String(row?.usage_model||''),last_deployed_from:String(row?.last_deployed_from||'')
  }));
}
async function main(){
  assert(OIDC_TOKEN.split('.').length===3,'CLOUDFLARE_RELAY_OIDC_REQUIRED');
  assert(CF_TOKEN.length>=20,'CLOUDFLARE_API_TOKEN_REQUIRED');
  assert(/^[A-Za-z0-9_-]{8,80}$/.test(ACCOUNT_ID),'CLOUDFLARE_ACCOUNT_ID_INVALID');
  await worker('/api/internal/cloudflare-api-relay/heartbeat',{run_id:Number(process.env.GITHUB_RUN_ID||0)||null});
  for(let i=0;i<5;i++){
    const claim=await worker('/api/internal/cloudflare-api-relay/claim');
    const job=claim?.job;if(!job)break;
    try{
      const limit=Math.max(1,Math.min(100,Number(job.input?.limit)||20));
      if(job.operation==='workers.list'){
        const body=await cf('/accounts/'+encodeURIComponent(ACCOUNT_ID)+'/workers/scripts');
        const scripts=cleanWorkers(body,limit);
        await worker('/api/internal/cloudflare-api-relay/result',{job_id:job.id,status:'COMPLETE',result:{provider:'cloudflare',transport:'github-actions-relay',scripts,count:scripts.length}});
      }else if(job.operation==='deployments.list'){
        const script=String(job.input?.script||'').trim();
        if(!/^[A-Za-z0-9_.:@-]{1,128}$/.test(script))throw Object.assign(new Error('CLOUDFLARE_SCRIPT_INVALID'),{code:'CLOUDFLARE_SCRIPT_INVALID'});
        const body=await cf('/accounts/'+encodeURIComponent(ACCOUNT_ID)+'/workers/scripts/'+encodeURIComponent(script)+'/deployments');
        const deployments=(Array.isArray(body?.result?.deployments)?body.result.deployments:[]).slice(0,limit).map(row=>({
          id:String(row?.id||''),created_on:String(row?.created_on||''),source:String(row?.source||''),strategy:String(row?.strategy||''),
          versions:Array.isArray(row?.versions)?row.versions.slice(0,20).map(v=>({version_id:String(v?.version_id||''),percentage:Number(v?.percentage||0)})):[]
        }));
        await worker('/api/internal/cloudflare-api-relay/result',{job_id:job.id,status:'COMPLETE',result:{provider:'cloudflare',transport:'github-actions-relay',script,deployments,count:deployments.length}});
      }else{
        throw Object.assign(new Error('CLOUDFLARE_RELAY_OPERATION_NOT_ALLOWED'),{code:'CLOUDFLARE_RELAY_OPERATION_NOT_ALLOWED'});
      }
    }catch(error){
      await worker('/api/internal/cloudflare-api-relay/result',{job_id:job.id,status:'FAILED',error:String(error?.code||error?.message||'CLOUDFLARE_RELAY_FAILED').slice(0,180)}).catch(()=>{});
    }
  }
}
main().catch(e=>{console.error(String(e?.code||e?.message||e));process.exit(1)});
