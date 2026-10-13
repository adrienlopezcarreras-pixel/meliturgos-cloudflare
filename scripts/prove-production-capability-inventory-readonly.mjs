// Strictly GET-only inventory proof for the already-deployed MEL Worker.
// Never call capability.audit, execute, refresh=1 or create/delete secrets.
import {createHmac, hkdfSync} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import process from 'node:process';
import {writeFile} from 'node:fs/promises';

export const REPO='adrienlopezcarreras-pixel/meliturgos-cloudflare';
export const DEFAULT_BASE='https://meliturgos.adrien-lopezcarreras.workers.dev';
export const READ_ONLY_ENDPOINTS=Object.freeze(['/api/gen2/code/self-check','/api/gen2/capabilities']);

export function deriveParallelProof(keyB64,sha){
  const secret=Buffer.from(String(keyB64||''),'base64');
  if(secret.length!==32|| !/^[a-f0-9]{40}$/.test(String(sha||''))) {
    throw Error('CAPABILITY_INVENTORY_PARALLEL_PROOF_INPUT_INVALID');
  }
  return Buffer.from(hkdfSync('sha256',secret,
    Buffer.from('meliturgos-parallel-proof-salt-v1'),
    Buffer.from('MEL_PARALLEL_PROOF_V1:'+sha),32)).toString('base64url');
}
const statusBucket = row => {
  const status=String(row?.health||'UNKNOWN').toUpperCase();
  return ['HEALTHY','ONLINE','DEGRADED','ERROR','FAILED','UNAVAILABLE','DISABLED','UNKNOWN','WAITING_PC'].includes(status)
    ? status : 'OTHER';
};
export function assessInventory(selfCheck,inventory,expectedSha){
  const deployed=String(selfCheck?.deployed_sha||'').toLowerCase();
  if(selfCheck?.ok!==true || selfCheck?.exact_deployment_identity_known!==true ||
      deployed!==String(expectedSha||'').toLowerCase()){
    return {ok:false,code:'CAPABILITY_INVENTORY_EXACT_DEPLOYMENT_NOT_PROVEN'};
  }
  if(inventory?.ok!==true || inventory?.health_refreshed!==false ||
    !Array.isArray(inventory?.capabilities)||inventory.capabilities.length<25) {
    return {ok:false,code:'CAPABILITY_INVENTORY_INVALID_OR_REFRESHED'};
  }
  const ids=inventory.capabilities.map(row=>row?.id);
  if(ids.some(id=>typeof id!=='string'||!id.trim()) || new Set(ids).size!==ids.length){
    return {ok:false,code:'CAPABILITY_INVENTORY_DUPLICATE_OR_INVALID_ID'};
  }
  const health={};
  let low=0, protectedCount=0, enabled=0;
  for(const row of inventory.capabilities){
    health[statusBucket(row)]=(health[statusBucket(row)]||0)+1;
    if(row?.risk==='LOW')low++;
    else if(row?.risk==='MEDIUM'||row?.risk==='HIGH')protectedCount++;
    else return {ok:false,code:'CAPABILITY_INVENTORY_RISK_INVALID'};
    if(typeof row?.enabled!=='boolean')
      return {ok:false,code:'CAPABILITY_INVENTORY_ENABLED_INVALID'};
    if(row.enabled)enabled++;
  }
  return {ok:true,code:'CAPABILITY_INVENTORY_READ_ONLY_REAL_DEPLOYMENT',
    schema:'mel.capability-production-readonly-inventory/v1',deployed_sha:deployed,
    capability_count:ids.length,enabled_count:enabled,
    low_risk_count:low,protected_count:protectedCount,health,
    capability_execution_tested:false,stress_job_started:false,
    mutation_scope:'GET_ONLY_NO_REFRESH_NO_D1_WRITE',max_enabled:false};
}

export async function probeLiveInventory({
  token,expectedSha,baseUrl=DEFAULT_BASE,fetchImpl=fetch,
}={}){
  if(!token || !/^[a-f0-9]{40}$/.test(String(expectedSha||'')) ||
    baseUrl!==DEFAULT_BASE)return {ok:false,code:'CAPABILITY_INVENTORY_PROBE_INPUT_INVALID'};
  const headers={
    'x-mel-release-smoke':'1','x-mel-parallel-proof':token,
    'accept':'application/json',
  };
  const out=[];
  for(const endpoint of READ_ONLY_ENDPOINTS){
    let response;
    try{
      response=await fetchImpl(baseUrl+endpoint,{
        method:'GET',redirect:'error',headers,
        signal:AbortSignal.timeout(25000),
      });
    }catch{return {ok:false,code:'CAPABILITY_INVENTORY_GET_TRANSPORT_FAILED'};}
    if(response.status!==200)return {ok:false,code:'CAPABILITY_INVENTORY_GET_HTTP_'+String(response.status)};
    let body;
    try{body=await response.json();}catch{return {ok:false,code:'CAPABILITY_INVENTORY_INVALID_JSON'};}
    out.push(body);
  }
  return assessInventory(out[0],out[1],expectedSha);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  try{
    const sha=String(process.env.EXPECTED_SHA||'');
    const token=deriveParallelProof(process.env.PROOF_KEY_B64,sha);
    const result=await probeLiveInventory({token,expectedSha:sha});
    await writeFile('capability-inventory-readonly-proof.json',JSON.stringify(result,null,2)+'\n','utf8');
    console.log(JSON.stringify(result));
    if(!result.ok)process.exitCode=1;
  }catch(e){console.error(/^CAPABILITY_/.test(String(e?.message||''))?e.message:'CAPABILITY_INVENTORY_UNEXPECTED_ERROR');process.exitCode=1;}
}
