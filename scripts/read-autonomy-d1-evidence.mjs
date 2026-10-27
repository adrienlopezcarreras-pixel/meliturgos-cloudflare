import { writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

// Constant, parameterized read. Source/reason text never leaves the database.
export const CONTROL_SQL = `WITH control AS (
  SELECT UPPER(status) AS status, last_seen,
    CASE WHEN json_valid(metadata_json) THEN metadata_json ELSE '{}' END AS m
  FROM dev_bridge_state WHERE bridge_id = ? LIMIT 1
), normalized AS (
  SELECT *, CASE WHEN status='PAUSED' OR json_extract(m,'$.paused')=1 THEN 1 ELSE 0 END AS paused,
    CASE WHEN status='MAX_AUTONOMY' OR json_extract(m,'$.max_autonomy')=1 OR json_extract(m,'$.owner_override')=1 THEN 1 ELSE 0 END AS stored_max,
    COALESCE(json_extract(m,'$.source'),'') AS source,
    COALESCE(json_extract(m,'$.reason'),'') AS reason
  FROM control
)
SELECT CASE WHEN status IN ('PAUSED','RUNNING','MAX_AUTONOMY') THEN status ELSE 'UNKNOWN' END AS record_status,
  paused, CASE WHEN paused=1 THEN 0 ELSE stored_max END AS max_autonomy,
  CASE WHEN stored_max=1 OR json_extract(m,'$.max_remembered')=1 THEN 1 ELSE 0 END AS max_remembered,
  COALESCE(json_extract(m,'$.updated_at'),last_seen) AS control_version,
  COALESCE(json_extract(m,'$.owner_control_version'),json_extract(m,'$.updated_at'),last_seen) AS owner_control_version,
  json_extract(m,'$.launch_approved_sha') AS launch_approved_sha,
  CASE
    WHEN paused=0 THEN 'RUNNING'
    WHEN source='default-d1-fail-closed' THEN 'OWNER_ENABLE_REQUIRED'
    WHEN instr(lower(source||' '||reason),'rollback')>0 THEN 'SAFETY_ROLLBACK'
    WHEN source IN ('release-predeploy-binder','release-launch-bootstrap')
      AND reason IN ('predeploy-release-safety','NEW_RELEASE_AWAITING_OWNER_LAUNCH') THEN 'RELEASE_PAUSE'
    WHEN instr(lower(source||' '||reason),'watchdog')>0 OR instr(lower(reason),'no_progress')>0 THEN 'SAFETY_PROGRESS_STOP'
    WHEN instr(lower(source||' '||reason),'safety')>0 OR instr(lower(source||' '||reason),'security')>0
      OR instr(lower(source||' '||reason),'emergency')>0 THEN 'SAFETY_STOP'
    WHEN source IN ('owner-ui','owner-api','owner-autonomy-api','owner-authorized-bootstrap') THEN 'OWNER_CONTROL'
    ELSE 'PROTECTED_NON_RELEASE_STOP' END AS pause_class
FROM normalized`;
const CLASSES = new Set(['RUNNING','OWNER_ENABLE_REQUIRED','SAFETY_ROLLBACK','RELEASE_PAUSE','SAFETY_PROGRESS_STOP','SAFETY_STOP','OWNER_CONTROL','PROTECTED_NON_RELEASE_STOP']);
const fail = (error_code, extra={}) => ({ok:false,schema:'mel.autonomy-d1-readonly.v1',error_code,...extra});
const version = value => Number.isSafeInteger(value)&&value>0?value:null;

export async function readAutonomyD1Evidence({accountId,apiToken,databaseId,fetchImpl=fetch}={}) {
  if(!/^[a-f0-9]{32}$/i.test(String(accountId||''))||!apiToken||!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(String(databaseId||''))) return fail('D1_READ_CREDENTIALS_OR_BINDING_UNAVAILABLE');
  let response,body;
  try {
    response=await fetchImpl(`https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}/query`,{
      method:'POST',redirect:'error',signal:AbortSignal.timeout(30000),
      headers:{authorization:'Bearer '+apiToken,'content-type':'application/json'},
      body:JSON.stringify({sql:CONTROL_SQL,params:['mel-autonomy-control']}),
    });
    if(!response.ok)return fail(response.status===401||response.status===403?'D1_READ_ACCESS_DENIED':'D1_READ_HTTP_FAILED',{http_status:response.status});
    body=await response.json();
  } catch {return fail('D1_READ_TRANSPORT_OR_RESPONSE_FAILED');}
  const result=body?.result?.[0];
  if(body?.success!==true||result?.success!==true||!Array.isArray(result.results))return fail('D1_READ_QUERY_FAILED');
  if(result.meta?.rows_written!==0)return fail('D1_READ_ONLY_METRICS_UNPROVEN');
  if(result.results.length!==1)return fail('D1_CONTROL_RECORD_MISSING_OR_AMBIGUOUS');
  const row=result.results[0];
  if(!CLASSES.has(row.pause_class)||![0,1].includes(row.paused)||![0,1].includes(row.max_autonomy)||![0,1].includes(row.max_remembered))return fail('D1_CONTROL_RESPONSE_INVALID');
  return {ok:true,schema:'mel.autonomy-d1-readonly.v1',proof_source:'cloudflare-d1-select',
    paused:row.paused===1,max_autonomy:row.max_autonomy===1,max_remembered:row.max_remembered===1,
    pause_class:row.pause_class,control_version:version(row.control_version),owner_control_version:version(row.owner_control_version),
    launch_approved_sha:/^[a-f0-9]{40}$/i.test(String(row.launch_approved_sha||''))?row.launch_approved_sha.toLowerCase():null,
    rows_written:0,observed_at:new Date().toISOString()};
}

// Fixed mission/lease diagnostic: no arbitrary SQL, owner text, code or mail content.
export const FOUNDER_SQL = `SELECT id,status,updated_at,candidate_branch,
  (SELECT last_seen FROM dev_bridge_state WHERE bridge_id='runtime-lease:autonomy-heartbeat') AS lease_expires_at,
  json_extract(result_json,'$.runtime_retry.attempts') AS runtime_attempts,
  json_extract(result_json,'$.autonomy_deferral.code') AS deferred_code,
  json_extract(result_json,'$.implementation_planning_diagnostic.code') AS implementation_code,
  json_extract(result_json,'$.bridge_preparation.code') AS bridge_code,
  json_extract(plan_json,'$.revision.reason') AS revision_code,
  json_extract(result_json,'$.bridge_preparation_diagnostic.code') AS bridge_diagnostic,
  json_extract(result_json,'$.teacher_bridge.review.verdict') AS teacher_verdict,
  json_extract(result_json,'$.autonomy_completion.candidate_sha') AS completion_sha,
  json_extract(result_json,'$.autonomy_completion.ci.head_sha') AS ci_head_sha,
  json_extract(result_json,'$.autonomy_completion.ci.run_id') AS ci_run_id,
  json_extract(result_json,'$.autonomy_completion.ci.conclusion') AS ci_conclusion,
  json_extract(result_json,'$.autonomy_completion.ci.verified') AS ci_verified,
  json_extract(result_json,'$.council_model_attempts') AS council_model_attempts,
  json_extract(result_json,'$.council_model_exclusions') AS council_model_exclusions
FROM dev_jobs WHERE id LIKE 'mel-autonomy-mel-founder-01-%'
ORDER BY created_at DESC LIMIT 3`;
export function councilProviderEvidence(row={}) {
  const array=value=>{try{const parsed=typeof value==='string'?JSON.parse(value):value;return Array.isArray(parsed)?parsed:[];}catch{return [];}};
  const id=value=>/^[A-Za-z0-9@/_.:-]{1,120}$/.test(String(value||''))?value:null;
  const code=value=>/^[A-Z][A-Z0-9_:-]{0,99}$/.test(String(value||''))?value:null;
  return {
    attempts:array(row.council_model_attempts).slice(-80).map(item=>({provider_id:id(item?.provider_id),model_id:id(item?.model_id),role:code(item?.role),status:['OK','FAILED','TIMEOUT'].includes(item?.status)?item.status:null,duration_ms:Number.isFinite(item?.duration_ms)&&item.duration_ms>=0?item.duration_ms:null,error:code(item?.error)})),
    exclusions:array(row.council_model_exclusions).slice(0,40).map(item=>({id:id(item?.id),until:Number.isSafeInteger(item?.until)&&item.until>0?item.until:null})),
  };
}

export async function readFounderD1Evidence({accountId,apiToken,databaseId,fetchImpl=fetch}={}) {
  if (!/^[a-f0-9]{32}$/i.test(String(accountId||'')) || !apiToken || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(String(databaseId||''))) return fail('D1_READ_CREDENTIALS_OR_BINDING_UNAVAILABLE');
  try {
    const res = await fetchImpl(`https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}/query`, {
      method:'POST',redirect:'error',signal:AbortSignal.timeout(30000),headers:{authorization:'Bearer '+apiToken,'content-type':'application/json'},body:JSON.stringify({sql:FOUNDER_SQL,params:[]}),
    });
    if (!res.ok) return fail('D1_FOUNDER_READ_HTTP_FAILED',{http_status:res.status});
    const body = await res.json(); const result = body?.result?.[0];
    if (body?.success!==true || result?.success!==true || result?.meta?.rows_written!==0 || !Array.isArray(result.results)) return fail('D1_FOUNDER_READ_UNPROVEN');
    const code = value => /^[A-Z0-9_:.-]{1,180}$/.test(String(value||'')) ? value : null;
    return {ok:true,rows_written:0,observed_at:new Date().toISOString(),jobs:result.results.slice(0,3).map(row=>({
      council:councilProviderEvidence(row),
      id:/^mel-autonomy-mel-founder-01-[a-z0-9-]{1,100}$/.test(String(row.id||''))?row.id:null,
      status:code(row.status),updated_at:version(row.updated_at),lease_expires_at:version(row.lease_expires_at),runtime_attempts:Number.isSafeInteger(row.runtime_attempts)?row.runtime_attempts:null,
      deferred_code:code(row.deferred_code),implementation_code:code(row.implementation_code),bridge_code:code(row.bridge_code),revision_code:code(row.revision_code),bridge_diagnostic:code(row.bridge_diagnostic),teacher_verdict:code(row.teacher_verdict),
      completion_sha:/^[a-f0-9]{40}$/.test(String(row.completion_sha||''))?row.completion_sha:null,
      ci_head_sha:/^[a-f0-9]{40}$/.test(String(row.ci_head_sha||''))?row.ci_head_sha:null,
      ci_run_id:Number.isSafeInteger(row.ci_run_id)&&row.ci_run_id>0?row.ci_run_id:null,
      ci_conclusion:['success','failure','cancelled'].includes(row.ci_conclusion)?row.ci_conclusion:null,ci_verified:row.ci_verified===1,
    }))};
  } catch {return fail('D1_FOUNDER_READ_TRANSPORT_FAILED');}
}

async function main() {
  let proof;
  try {
    const {unstable_readConfig}=await import('wrangler');
    const config=unstable_readConfig({config:'wrangler.jsonc'});
    const databaseId=config.d1_databases?.find(row=>row.binding==='DB')?.database_id;
    const access={accountId:process.env.CLOUDFLARE_ACCOUNT_ID,apiToken:process.env.CLOUDFLARE_API_TOKEN,databaseId};
    proof=await readAutonomyD1Evidence(access);
    if(proof.ok)proof.founder=await readFounderD1Evidence(access);
  } catch {proof=fail('D1_READ_CONFIGURATION_UNAVAILABLE');}
  await writeFile('autonomy-d1-readonly-evidence.json',JSON.stringify(proof,null,2)+'\n');
  console.log(JSON.stringify(proof));
  if(process.env.GITHUB_ACTIONS==='true')console.log('::notice title=MEL D1 read-only control::result='+(proof.ok?'VERIFIED':'UNAVAILABLE')+';pause_class='+(proof.pause_class||'UNAVAILABLE')+';paused='+String(proof.paused??'UNAVAILABLE')+';max_autonomy='+String(proof.max_autonomy??'UNAVAILABLE')+';error_code='+(proof.error_code||'NONE'));
  if(!proof.ok)process.exitCode=1;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await main();
