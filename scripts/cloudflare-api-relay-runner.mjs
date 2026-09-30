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
async function cf(path,{method='GET',body}={}){
  const headers={authorization:'Bearer '+CF_TOKEN,accept:'application/json'};
  if(body!==undefined)headers['content-type']='application/json';
  const r=await fetch('https://api.cloudflare.com/client/v4'+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(60000)});
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
      }else if(job.operation==='deployments.create'){
        const script=String(job.input?.script||'').trim();
        if(!/^[A-Za-z0-9_.:@-]{1,128}$/.test(script))throw Object.assign(new Error('CLOUDFLARE_SCRIPT_INVALID'),{code:'CLOUDFLARE_SCRIPT_INVALID'});
        const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        const rawVersions=Array.isArray(job.input?.versions)?job.input.versions:[];
        if(rawVersions.length<1||rawVersions.length>2)throw Object.assign(new Error('CLOUDFLARE_VERSIONS_INVALID'),{code:'CLOUDFLARE_VERSIONS_INVALID'});
        const seen=new Set();
        const versions=rawVersions.map(row=>{
          const version_id=String(row?.version_id||'').trim();
          const percentage=Number(row?.percentage);
          if(!UUID.test(version_id)||seen.has(version_id))throw Object.assign(new Error('CLOUDFLARE_VERSION_ID_INVALID'),{code:'CLOUDFLARE_VERSION_ID_INVALID'});
          if(!Number.isFinite(percentage)||percentage<0.01||percentage>100)throw Object.assign(new Error('CLOUDFLARE_PERCENTAGE_INVALID'),{code:'CLOUDFLARE_PERCENTAGE_INVALID'});
          seen.add(version_id);return {version_id,percentage};
        });
        if(Math.abs(versions.reduce((sum,row)=>sum+row.percentage,0)-100)>0.001)throw Object.assign(new Error('CLOUDFLARE_PERCENTAGE_TOTAL_INVALID'),{code:'CLOUDFLARE_PERCENTAGE_TOTAL_INVALID'});
        const message=String(job.input?.message||'').trim().slice(0,500);
        const path='/accounts/'+encodeURIComponent(ACCOUNT_ID)+'/workers/scripts/'+encodeURIComponent(script)+'/deployments';
        const createdBody=await cf(path,{method:'POST',body:{strategy:'percentage',versions,annotations:{'workers/message':message||'MELITURGOS approved deployment control'}}});
        const deploymentId=String(createdBody?.result?.id||'').trim();
        if(!UUID.test(deploymentId))throw Object.assign(new Error('CLOUDFLARE_DEPLOYMENT_ID_MISSING'),{code:'CLOUDFLARE_DEPLOYMENT_ID_MISSING'});
        const verifiedBody=await cf(path+'/'+encodeURIComponent(deploymentId));
        const row=verifiedBody?.result||createdBody?.result||{};
        const deployment={
          id:String(row?.id||deploymentId),created_on:String(row?.created_on||''),source:String(row?.source||''),strategy:String(row?.strategy||''),
          versions:Array.isArray(row?.versions)?row.versions.slice(0,2).map(v=>({version_id:String(v?.version_id||''),percentage:Number(v?.percentage||0)})):[]
        };
        await worker('/api/internal/cloudflare-api-relay/result',{job_id:job.id,status:'COMPLETE',result:{provider:'cloudflare',transport:'github-actions-relay',script,deployment}});
      }else{
        throw Object.assign(new Error('CLOUDFLARE_RELAY_OPERATION_NOT_ALLOWED'),{code:'CLOUDFLARE_RELAY_OPERATION_NOT_ALLOWED'});
      }
    }catch(error){
      await worker('/api/internal/cloudflare-api-relay/result',{job_id:job.id,status:'FAILED',error:String(error?.code||error?.message||'CLOUDFLARE_RELAY_FAILED').slice(0,180)}).catch(()=>{});
    }
  }
}
main().catch(e=>{console.error(String(e?.code||e?.message||e));process.exit(1)});
