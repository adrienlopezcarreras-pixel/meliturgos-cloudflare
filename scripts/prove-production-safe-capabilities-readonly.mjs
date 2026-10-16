// Exact-SHA authenticated, narrowly allowlisted LIVE capability execution.
// Only PURE echo or existing list operations, never audit, writes, MAX, shell or deployments.
import {deriveParallelProof,probeLiveInventory,DEFAULT_BASE} from './prove-production-capability-inventory-readonly.mjs';
import {writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import process from 'node:process';

export const ALLOWLIST=Object.freeze([
  {id:'echo',input:{value:'mel-readonly-echo-proof-v1'},output:'echo'},
  {id:'project.list',input:{},output:'array'},
  {id:'skill.list',input:{},output:'array'},
  {id:'timeline.list',input:{},output:'array'},
]);

export function validateSelectedRecords(items,allowlist=ALLOWLIST){
  if(!Array.isArray(items)||!Array.isArray(allowlist))return {ok:false,code:'LIVE_SAFE_RECORDS_INVALID'};
  for(const item of allowlist){
    const row=items.find(x=>x?.id===item.id);
    if(!row || row.enabled!==true || row.risk!=='LOW'){
      return {ok:false,code:'LIVE_SAFE_CAPABILITY_NOT_ENABLED_LOW_RISK',id:item.id};
    }
  }
  return {ok:true,code:'LIVE_SAFE_CAPABILITIES_PRECHECKED',count:allowlist.length};
}
export function validateExecution(body,sample){
  if(body?.ok!==true||body?.capability!==sample.id||body.result==null||
    body?.error != null ||
    (body?.result && !Array.isArray(body.result) &&
      (body.result.error != null || body.result.ok===false))){
    return {ok:false,code:'LIVE_SAFE_CAPABILITY_EXECUTION_NOT_PROVEN',id:sample.id};
  }
  if(sample.output==='echo' && body.result?.value!==sample.input.value)
    return {ok:false,code:'LIVE_SAFE_ECHO_VALUE_MISMATCH',id:sample.id};
  if(sample.output==='array' && !Array.isArray(body.result))
    return {ok:false,code:'LIVE_SAFE_LIST_RESULT_NOT_ARRAY',id:sample.id};
  return {ok:true,code:'LIVE_SAFE_CAPABILITY_EXECUTED',id:sample.id};
}

export async function proveSafeExecutions({
  token,expectedSha,fetchImpl=fetch,allowlist=ALLOWLIST,
}={}){
  if(!token || !/^[a-f0-9]{40}$/.test(String(expectedSha||'')) ||
    !Array.isArray(allowlist)||allowlist.length!==ALLOWLIST.length||
    allowlist.some((item,index)=>JSON.stringify(item)!==JSON.stringify(ALLOWLIST[index]))){
    return {ok:false,code:'LIVE_SAFE_EXECUTION_PROBE_INPUT_INVALID'};
  }
  const headers={'x-mel-release-smoke':'1','x-mel-parallel-proof':token,accept:'application/json'};
  const live=await probeLiveInventory({token,expectedSha,fetchImpl});
  if(!live.ok)return {ok:false,code:'LIVE_SAFE_DEPLOYMENT_INVENTORY_NOT_PROVEN',cause:live.code};
  let res;
  try{
    res=await fetchImpl(DEFAULT_BASE+'/api/gen2/capabilities',{
      method:'GET',redirect:'error',headers,signal:AbortSignal.timeout(25000),
    });
  }catch{return {ok:false,code:'LIVE_SAFE_RECORDS_GET_FAILED'};}
  if(res.status!==200)return {ok:false,code:'LIVE_SAFE_RECORDS_HTTP_'+res.status};
  let body;
  try{body=await res.json();}catch{return {ok:false,code:'LIVE_SAFE_RECORDS_INVALID_JSON'};}
  if(body?.ok!==true||body?.health_refreshed!==false)
    return {ok:false,code:'LIVE_SAFE_RECORDS_INVALID'};
  const valid=validateSelectedRecords(body.capabilities,allowlist);
  if(!valid.ok)return valid;
  const executions=[];
  for(const sample of allowlist){
    let response;
    try{
      response=await fetchImpl(DEFAULT_BASE+'/api/gen2/capabilities/execute',{
        method:'POST',redirect:'error',signal:AbortSignal.timeout(25000),
        headers:{...headers,'content-type':'application/json'},
        body:JSON.stringify({id:sample.id,input:sample.input}),
      });
    }catch{return {ok:false,code:'LIVE_SAFE_EXECUTION_TRANSPORT_FAILED',id:sample.id};}
    if(response.status!==200)return {ok:false,code:'LIVE_SAFE_EXECUTION_HTTP_'+response.status,id:sample.id};
    let output;
    try{output=await response.json();}catch{return {ok:false,code:'LIVE_SAFE_EXECUTION_INVALID_JSON',id:sample.id};}
    const verdict=validateExecution(output,sample);
    if(!verdict.ok)return verdict;
    executions.push(sample.id);
  }
  // Fail closed if production rolled to another release while the four calls ran.
  // A successful preflight alone cannot attribute every execution to one SHA.
  let finalResponse;
  try{
    finalResponse=await fetchImpl(DEFAULT_BASE+'/api/gen2/code/self-check',{
      method:'GET',redirect:'error',headers,signal:AbortSignal.timeout(25000),
    });
  }catch{return {ok:false,code:'LIVE_SAFE_FINAL_DEPLOYMENT_CHECK_FAILED'};}
  if(finalResponse.status!==200)
    return {ok:false,code:'LIVE_SAFE_FINAL_DEPLOYMENT_HTTP_'+finalResponse.status};
  let finalIdentity;
  try{finalIdentity=await finalResponse.json();}
  catch{return {ok:false,code:'LIVE_SAFE_FINAL_DEPLOYMENT_INVALID_JSON'};}
  if(finalIdentity?.ok!==true || finalIdentity?.exact_deployment_identity_known!==true ||
    String(finalIdentity?.deployed_sha||'').toLowerCase()!==expectedSha.toLowerCase())
    return {ok:false,code:'LIVE_SAFE_DEPLOYMENT_CHANGED_DURING_EXECUTION'};
  return {ok:true,code:'LIVE_SAFE_READ_ONLY_CAPABILITIES_EXECUTED',
    deployed_sha:expectedSha,executed_count:executions.length,
    executed_capability_ids:executions,all_registered_capabilities_tested:false,
    mutation_scope:'FOUR_ALLOWLISTED_READ_OR_ECHO_EXECUTIONS',
    persistent_stress_tested:false,private_content_logged:false};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  try{
    const expectedSha=process.env.EXPECTED_SHA;
    const token=deriveParallelProof(process.env.PROOF_KEY_B64,expectedSha);
    const result=await proveSafeExecutions({token,expectedSha});
    await writeFile('capability-safe-execution-proof.json',JSON.stringify(result,null,2)+'\n');
    console.log(JSON.stringify(result));
    if(!result.ok)process.exitCode=1;
  }catch(e){console.error('LIVE_SAFE_PROOF_FAILURE_'+String(e?.code||'UNKNOWN'));process.exitCode=1;}
}
