// Narrow, explicitly owner-approved repair. No arbitrary job/SQL input, no
// approval or CI fabrication. Full snapshots stay in the existing D1 store.
import { randomUUID,createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { startMaintenanceLease,finishMaintenanceLease } from '../src/maintenance/maintenance-gate.js';
import { verifiedRepositoryFunding } from '../src/revenue/revenue-watch.js';
export const ORIGINAL='mel-autonomy-mel-founder-01-e1793054144390-1';
export const DUPLICATE='mel-autonomy-mel-founder-01-e1793099063810-1';
const BACKUP='owner-founder-recovery:'+ORIGINAL;
const parse=value=>typeof value==='string'?JSON.parse(value):value||{};
const changes=result=>Number(result?.meta?.changes||0);

export async function recoverFounderOwner(db,{expectedSha,now=Date.now,sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms)),leaseId=randomUUID()}={}) {
  if(!/^[a-f0-9]{40}$/.test(String(expectedSha||'')))throw Error('EXACT_RELEASE_SHA_REQUIRED');
  const control=await db.prepare("SELECT metadata_json FROM dev_bridge_state WHERE bridge_id='mel-autonomy-control'").first();
  if(parse(control?.metadata_json).launch_approved_sha!==expectedSha)throw Error('VERIFIED_RELEASE_CONTROL_SHA_MISMATCH');
  const actualPrior=await db.prepare('SELECT * FROM dev_jobs WHERE id=?').bind(ORIGINAL).first();
  const actualDuplicate=await db.prepare('SELECT * FROM dev_jobs WHERE id=?').bind(DUPLICATE).first();
  const saved=await db.prepare('SELECT metadata_json FROM dev_bridge_state WHERE bridge_id=?').bind(BACKUP).first();
  const archived=saved?parse(saved.metadata_json):null;
  if(archived && archived.expected_sha!==expectedSha)throw Error('BACKUP_RELEASE_SHA_MISMATCH');
  const prior=archived?.original||actualPrior;
  const duplicate=actualDuplicate||archived?.duplicate;
  const resumed=parse(actualPrior?.result_json).owner_resume;
  const alreadyResumed=resumed?.source==='owner-request'&&resumed?.job_id===ORIGINAL&&resumed?.release_sha===expectedSha;
  if(!prior||parse(prior.optional_context).roadmap_id!=='MEL-FOUNDER-01')throw Error('ORIGINAL_OBJECTIVE_MISSING');

  if(!['CANCELLED','QUEUED','REPAIR_REQUIRED','TEACHER_APPROVED'].includes(prior.status))throw Error('ORIGINAL_IS_BUSY_OR_TERMINAL');
  if(!duplicate||!['QUEUED','CANCELLED'].includes(duplicate.status)||parse(duplicate.optional_context).roadmap_id!=='MEL-FOUNDER-01')throw Error('DUPLICATE_STATE_UNSAFE');
  if(!alreadyResumed && (actualPrior?.updated_at!==prior.updated_at||actualPrior?.status!==prior.status))throw Error('ORIGINAL_CHANGED_SINCE_BACKUP');
  const revenue=archived?.revenue||(await db.prepare("SELECT j.*,w.data AS revenue_data FROM dev_jobs j LEFT JOIN revenue_watch w ON json_extract(w.data,'$.install_job_id')=j.id WHERE j.status='QUEUED' AND json_extract(j.optional_context,'$.source')='revenue-watch'").all()).results||[];
  const fence=await db.prepare("SELECT status,metadata_json FROM dev_bridge_state WHERE bridge_id='mel-global-maintenance-fence'").first();
  if(alreadyResumed&&!actualDuplicate&&fence?.status!=='PAUSED')return {ok:true,status:'ALREADY_RECOVERED',job_id:ORIGINAL,ci_verified:false};
  if(fence?.status==='PAUSED'){
    if(!archived?.maintenance_lease_id||parse(fence.metadata_json).lease_id!==archived.maintenance_lease_id)throw Error('MAINTENANCE_ALREADY_PAUSED_OR_RECOVERY_REQUIRED');
    leaseId=archived.maintenance_lease_id;
  }
  const snapshot=saved?.metadata_json||JSON.stringify({original:prior,duplicate,revenue,maintenance_lease_id:leaseId,authorized_scope:'owner-founder-20261027',expected_sha:expectedSha});
  const snapshotHash=createHash('sha256').update(snapshot).digest('hex');
  if(fence?.status!=='PAUSED')await startMaintenanceLease(db,{leaseId,now:now(),ttlMs:20*60000});
  // Failure deliberately retains the existing maintenance fence for recovery.
  const deadline=now()+6*60000;
  while(true){
    const lease=await db.prepare("SELECT last_seen FROM dev_bridge_state WHERE bridge_id='runtime-lease:autonomy-heartbeat'").first();
    if(Number(lease?.last_seen||0)<=now())break;
    if(now()>=deadline)throw Error('AUTONOMY_LEASE_DID_NOT_DRAIN');
    await sleep(1000);
  }
  await db.prepare("INSERT INTO dev_bridge_state(bridge_id,last_seen,status,metadata_json) VALUES(?,?,'BACKED_UP',?) ON CONFLICT(bridge_id) DO NOTHING").bind(BACKUP,now(),snapshot).run();
  const backup=await db.prepare('SELECT metadata_json FROM dev_bridge_state WHERE bridge_id=?').bind(BACKUP).first();
  if(backup?.metadata_json!==snapshot)throw Error('FOUNDER_BACKUP_CONFLICT_OR_UNVERIFIED');
  const epoch=Number((await db.prepare("SELECT last_seen FROM dev_bridge_state WHERE bridge_id='activity-list-epoch'").first())?.last_seen||0);
  if(!Number.isSafeInteger(epoch)||epoch<=0)throw Error('ACTIVITY_EPOCH_REQUIRED');
  const result=parse(prior.result_json);
  result.owner_resume={source:'owner-request',authorized_by:'owner',job_id:ORIGINAL,activity_epoch:epoch,at:now(),release_sha:expectedSha,removed_duplicate:DUPLICATE,previous_runtime_retry:result.runtime_retry||null,previous_deferral:result.autonomy_deferral||null};
  delete result.autonomy_deferral;
  delete result.autonomy_blocked;
  delete result.autonomy_block_reason;
  if(result.runtime_retry?.last_error==="Cannot read properties of undefined (reading 'length')")delete result.runtime_retry;
  const deleted=actualDuplicate?await db.prepare('DELETE FROM dev_jobs WHERE id=? AND updated_at=? AND status=?').bind(DUPLICATE,duplicate.updated_at,duplicate.status).run():{meta:{changes:archived?1:0}};
  if(changes(deleted)!==1)throw Error('DUPLICATE_DELETE_CONFLICT');
  const restored=alreadyResumed?{meta:{changes:1}}:await db.prepare("UPDATE dev_jobs SET status='QUEUED',updated_at=?,error=NULL,result_json=? WHERE id=? AND updated_at=? AND status=?").bind(now(),JSON.stringify(result),ORIGINAL,prior.updated_at,prior.status).run();
  if(changes(restored)!==1)throw Error('ORIGINAL_RESTORE_CONFLICT');
  let excludedRevenue=0;
  for(const job of revenue){
    const offer=parse(job.revenue_data);
    if(verifiedRepositoryFunding(offer))continue;
    const write=await db.prepare("UPDATE dev_jobs SET status='CANCELLED',updated_at=?,error='FUNDING_UNVERIFIED' WHERE id=? AND updated_at=? AND status='QUEUED'").bind(now(),job.id,job.updated_at).run();
    excludedRevenue+=changes(write);
  }
  // Independent persisted reads before unpausing producers.
  const actual=await db.prepare('SELECT * FROM dev_jobs WHERE id=?').bind(ORIGINAL).first();
  const absent=await db.prepare('SELECT id FROM dev_jobs WHERE id=?').bind(DUPLICATE).first();
  const active=await db.prepare("SELECT COUNT(*) AS n FROM dev_jobs WHERE requested_by='mel-autonomy' AND status NOT IN ('CANCELLED','FAILED','COMPLETED','DONE','DONE_VERIFIED','VERIFIED','ACCEPTED') AND json_extract(optional_context,'$.roadmap_id')='MEL-FOUNDER-01'").first();
  if(absent||Number(active?.n)!==1||actual?.status!=='QUEUED'||actual.created_at!==prior.created_at||actual.tests_json!==prior.tests_json||actual.patch_json!==prior.patch_json||actual.goal!==prior.goal||parse(actual.result_json).owner_resume?.release_sha!==expectedSha)throw Error('FOUNDER_RECOVERY_VERIFICATION_FAILED');
  await finishMaintenanceLease(db,{leaseId,reconciled:true,now:now()});
  return {ok:true,status:'RECOVERED',job_id:ORIGINAL,removed_duplicate:DUPLICATE,original_creation_preserved:true,tests_and_patch_preserved:true,backup_key:BACKUP,backup_sha256:snapshotHash,unfunded_revenue_cancelled:excludedRevenue,ci_verified:false};
}

export async function d1FromEnvironment(){
  const {unstable_readConfig}=await import('wrangler');const config=unstable_readConfig({config:'wrangler.jsonc'});
  const database=config.d1_databases?.find(row=>row.binding==='DB')?.database_id;
  const account=process.env.CLOUDFLARE_ACCOUNT_ID;const token=process.env.CLOUDFLARE_API_TOKEN;
  if(!database||!account||!token)throw Error('D1_ACCESS_UNAVAILABLE');
  return {prepare(sql){let params=[];const execute=async()=>{
    const response=await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/d1/database/${database}/query`,{method:'POST',redirect:'error',signal:AbortSignal.timeout(30000),headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify({sql,params})});
    if(!response.ok)throw Error('D1_OPERATION_HTTP_FAILED');const body=await response.json();const result=body?.result?.[0];if(body.success!==true||result?.success!==true)throw Error('D1_OPERATION_FAILED');return result;
  };const statement={bind(...values){params=values;return statement;},async first(){return (await execute()).results?.[0]||null;},async all(){return execute();},async run(){return execute();}};return statement;}};
}
async function main(){
  if(process.env.OWNER_RECOVERY_APPROVAL!=='RESTORE_FOUNDER_01_AND_REMOVE_DUPLICATE')throw Error('OWNER_APPROVAL_REQUIRED');
  const proof=await recoverFounderOwner(await d1FromEnvironment(),{expectedSha:process.env.EXPECTED_PRODUCTION_SHA});
  await writeFile('founder-owner-recovery.json',JSON.stringify(proof,null,2)+'\n');console.log(JSON.stringify(proof));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(error=>{console.error(/^[A-Z0-9_]+$/.test(error.message)?error.message:'FOUNDER_RECOVERY_FAILED_NO_PRIVATE_DATA_LOGGED');process.exitCode=1;});
