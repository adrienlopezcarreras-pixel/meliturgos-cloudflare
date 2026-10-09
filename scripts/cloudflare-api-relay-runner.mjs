const BASE_URL=String(process.env.MEL_RELAY_BASE_URL||'https://meliturgos.adrien-lopezcarreras.workers.dev').replace(/\/$/,'');
const OIDC_TOKEN=String(process.env.MEL_CLOUDFLARE_RELAY_OIDC||'');
const CF_TOKEN=String(process.env.CLOUDFLARE_API_TOKEN||'');
const ACCOUNT_ID=String(process.env.CLOUDFLARE_ACCOUNT_ID||'');
function assert(v,c){if(!v)throw Object.assign(new Error(c),{code:c});}
async function worker(path,body={},method='POST'){
  const init={method,headers:{'x-mel-github-oidc':OIDC_TOKEN,'content-type':'application/json'},signal:AbortSignal.timeout(60000)};
  if(method!=='GET')init.body=JSON.stringify(body);
  const r=await fetch(BASE_URL+path,init);
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

  // Scoped live proof for the Windows Companion. The Worker accepts this OIDC
  // identity only for read-only status plus system.info / serial.list.
  const pcStatus=await worker('/api/computer/v1/status',{},'GET');
  const windowsDevices=(Array.isArray(pcStatus?.devices)?pcStatus.devices:[]).filter(row=>
    String(row?.platform||'').toLowerCase()==='windows'
  );
  console.log('PC_CONTROL_DEVICE_STATUS='+JSON.stringify(windowsDevices.map(row=>({
    id:row?.id||null,
    name:row?.name||null,
    online:row?.online===true,
    last_seen_at:Number(row?.last_seen_at||0)||null,
    remote_access_enabled:row?.metadata?.remote_access_enabled===true,
    engine_version:row?.metadata?.engine_version||null,
    engine_heartbeat_at:Number(row?.metadata?.engine_heartbeat_at||0)||null,
  }))));
  const computer=windowsDevices.find(row=>row?.online===true);
  if(computer){
    const submitted=[];
    for(const action of ['system.info','serial.list']){
      const row=await worker('/api/computer/v1/pc-control',{computer_id:computer.id,action,payload:{}});
      submitted.push({action,command_id:String(row?.command_id||'')});
    }
    const deadline=Date.now()+45000;
    let completed=[];
    while(Date.now()<deadline){
      await new Promise(resolve=>setTimeout(resolve,1500));
      const poll=await worker('/api/computer/v1/status?computer_id='+encodeURIComponent(computer.id),{},'GET');
      const commands=Array.isArray(poll?.commands)?poll.commands:[];
      completed=submitted.map(item=>({item,row:commands.find(cmd=>String(cmd?.id||'')===item.command_id)||null}));
      if(completed.every(entry=>['SUCCEEDED','FAILED'].includes(String(entry.row?.status||''))))break;
    }
    const proof=completed.map(entry=>({
      action:entry.item.action,
      command_id:entry.item.command_id,
      status:String(entry.row?.status||'TIMEOUT'),
      error_code:entry.row?.error_code||null,
      result:entry.row?.result??null,
    }));
    console.log('PC_CONTROL_LIVE_PROOF='+JSON.stringify({
      device:{id:computer.id,name:computer.name||null,online:true,remote_access_enabled:true,version:computer?.metadata?.version||null},
      commands:proof,
    }));
    if(proof.some(row=>row.status!=='SUCCEEDED')) throw Object.assign(new Error('PC_CONTROL_LIVE_PROOF_FAILED'),{code:'PC_CONTROL_LIVE_PROOF_FAILED'});

    const serialListResult=proof.find(row=>row.action==='serial.list')?.result;
    const serialOutput=Array.isArray(serialListResult?.outputs)
      ? serialListResult.outputs.find(row=>row?.action==='serial.list')
      : null;
    const ports=(Array.isArray(serialOutput?.ports)?serialOutput.ports:[])
      .map(value=>String(value||'').trim().toUpperCase())
      .filter(value=>/^COM\d{1,3}$/.test(value));

    const nonLegacyPorts=ports.filter(port=>port!=='COM1');
    const diagnosticPort=ports.length===1
      ? ports[0]
      : (nonLegacyPorts.length===1 ? nonLegacyPorts[0] : null);
    if(diagnosticPort){
      const port=diagnosticPort;
      const submit=await worker('/api/computer/v1/pc-control',{
        computer_id:computer.id,
        action:'serial.read',
        payload:{port,duration_ms:1500},
      });
      const commandId=String(submit?.command_id||'');
      const serialDeadline=Date.now()+20000;
      let serialCommand=null;
      while(Date.now()<serialDeadline){
        await new Promise(resolve=>setTimeout(resolve,1000));
        const poll=await worker('/api/computer/v1/status?computer_id='+encodeURIComponent(computer.id),{},'GET');
        const commands=Array.isArray(poll?.commands)?poll.commands:[];
        serialCommand=commands.find(cmd=>String(cmd?.id||'')===commandId)||null;
        if(['SUCCEEDED','FAILED'].includes(String(serialCommand?.status||''))) break;
      }
      const output=Array.isArray(serialCommand?.result?.outputs)
        ? serialCommand.result.outputs.find(row=>row?.action==='serial.read')
        : null;
      const raw=String(output?.text||'');
      const diagnostics=raw.split(/\r?\n/)
        .filter(line=>/(MEL|ESP|boot|error|fail|panic|watchdog|audio|I2S|ES8311|BLE|Link V2|transcription)/i.test(line))
        .slice(0,80).join('\n').slice(0,8000);
      console.log('MINI_SERIAL_READ_PROOF='+JSON.stringify({
        port,
        status:String(serialCommand?.status||'TIMEOUT'),
        error_code:serialCommand?.error_code||null,
        baud:Number(output?.baud||115200),
        chars:Number(output?.chars||0),
        diagnostics,
      }));
      if(String(serialCommand?.status||'')==='FAILED'){
        throw Object.assign(new Error('MINI_SERIAL_READ_FAILED'),{code:'MINI_SERIAL_READ_FAILED'});
      }
    }else{
      console.log('MINI_SERIAL_READ_PROOF='+JSON.stringify({
        skipped:true,
        reason:ports.length===0?'NO_SERIAL_PORT':'AMBIGUOUS_NON_LEGACY_SERIAL_PORTS',
        ports,
        non_legacy_ports:nonLegacyPorts,
      }));
    }
  }else{
    console.log('PC_CONTROL_LIVE_PROOF='+JSON.stringify({skipped:true,reason:'NO_ONLINE_REMOTE_WINDOWS_COMPANION'}));
  }
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
