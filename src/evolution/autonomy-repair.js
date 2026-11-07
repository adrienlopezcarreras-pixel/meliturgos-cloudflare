import {getAutonomyControl,setAutonomyControl,ownerControlVersion,normalizeRepairLane} from './autonomy-control.js';
import {isAcceptedRoadmapCodeJob} from '../roadmap/roadmap-code-acceptance.js';

export {MAX_AUTONOMOUS_REPAIR_ATTEMPTS} from './autonomy-repair-policy.js';
const fail = code => Object.assign(new Error(code),{code,status:409});
export function repairLane(control) {
 const lane=normalizeRepairLane(control?.repair);
 return lane && lane.owner_control_version===ownerControlVersion(control) ? lane : null;
}
export async function beginAutomaticRepair(db,job,control,{memoryState=null}={}) {
 if (job?.requested_by!=='mel-autonomy' || control?.paused===true || control?.max_autonomy!==true) throw fail('AUTONOMY_REPAIR_OWNER_AUTH_REQUIRED');
 const lane=repairLane(control);
 if (control.repair_invalid || (control.repair && !lane) || (lane && lane.job_id!==job.id)) throw fail('AUTONOMY_REPAIR_SCOPE_CONFLICT');
 return setAutonomyControl(db,{paused:false,max_autonomy:true,source:'bridge-repair-lane',reason:'repairing-current-mission',
  repair:lane||{schema:'mel.autonomy-repair/v1',job_id:job.id,owner_control_version:ownerControlVersion(control),started_at:Date.now()},
  expected_updated_at:control.updated_at,memoryState});
}
export function scopeRepairRepository(repository,id) {
 const listKeys=new Set(['list','listActiveAutonomyJobs']);
 const writeKeys=new Set(['update','resume','checkpoint','claimPrepared','resumeWaitingDependency','resumeSecondPassQueued','reconcileVerifiedAutonomyJob']);
 return new Proxy(repository,{get(target,key){
  if(key==='create'||key==='createIfAbsent'||key==='claim')return async()=>{throw fail('AUTONOMY_REPAIR_NEW_JOB_FORBIDDEN');};
  if(key==='get')return async(wanted)=>wanted===id?target.get(wanted):null;
  if(listKeys.has(key))return async(...args)=>(await target[key](...args)).filter(job=>job.id===id);
  if(key==='claimQueuedAutonomy')return async(wanted,args)=>{
   if(wanted!==id)throw fail('AUTONOMY_REPAIR_JOB_OUT_OF_SCOPE');
   return target.claimQueuedRepair(wanted,args);
  };
  if(writeKeys.has(key)&&typeof target[key]==='function')return async(wanted,...args)=>{
   if(wanted!==id)throw fail('AUTONOMY_REPAIR_JOB_OUT_OF_SCOPE');
   return target[key](wanted,...args);
  };
  const value=target[key];return typeof value==='function'?value.bind(target):value;
 }});
}

// Called only after the canonical release's complete health gate. It never
// turns MAX on: a stopped owner remains stopped, and only a verified repair
// may release the held mission stream.
export async function completeVerifiedRepair(db,repository,{deployedSha,releaseVerified=false,memoryState=null,verifyDescendant=null}={}) {
 const control=await getAutonomyControl(db,{memoryState});
 if(control.paused===true || control.max_autonomy!==true)return {ok:true,status:'REPAIR_OWNER_STOP_PRESERVED',resumed:false};
 const lane=repairLane(control);
 if(!lane)return control.repair||control.repair_invalid?{ok:false,status:'AUTONOMY_REPAIR_SCOPE_INVALID',resumed:false}:{ok:true,status:'REPAIR_NOT_NEEDED',resumed:false};
 const job=await repository.get(lane.job_id);
 // Return only a fixed diagnostic code; never expose the held job, receipt or deployed SHA.
 // None of these failures is permitted to release the repair lane.
 const reject=reason=>({ok:false,status:'REPAIR_DELIVERY_NOT_VERIFIED',reason,resumed:false});
 if(releaseVerified!==true)return reject('REPAIR_RELEASE_HEALTH_NOT_VERIFIED');
 if(!isAcceptedRoadmapCodeJob(job))return reject('REPAIR_MISSION_ACCEPTANCE_NOT_VERIFIED');
 const receipt=job.result_json.roadmap_code_acceptance;
 if(receipt.candidate_sha!==deployedSha) {
  const protectedPaths=[...receipt.code_paths,...receipt.test_paths];
  // Ancestry alone is insufficient: the accepted mission's implementation
  // AND its tests must be unchanged in the exact deployed tree.
  const equivalent=typeof verifyDescendant==='function'
    && await verifyDescendant({acceptedSha:receipt.candidate_sha,deployedSha,protectedPaths});
  if(equivalent!==true && equivalent?.ok!==true) {
   const safeCode=equivalent&&typeof equivalent==='object'&&/^REPAIR_COMPARE_(?:INPUT_INVALID|FETCH_FAILED|HTTP_[0-9]{3}|JSON_INVALID|ANCESTRY_INVALID|TRUNCATED|PROTECTED_PATH_CHANGED)$/.test(String(equivalent.diagnostic||''))
    ? equivalent.diagnostic : null;
   return {...reject('REPAIR_ACCEPTED_SHA_NOT_DEPLOYED'),...(safeCode?{diagnostic:safeCode}:{})};
  }
 }
 const updated=await setAutonomyControl(db,{paused:false,max_autonomy:true,source:'verified-repair-completed',reason:'verified-repair-delivered',repair:null,expected_updated_at:control.updated_at,memoryState});
 return {ok:true,status:'AUTONOMOUS_REPAIR_COMPLETED',resumed:true,control:updated};
}

/**
 * Verify that a newer production SHA still contains the *identical* accepted
 * mission files. This is used only after exact deployed-SHA release health,
 * completed CI and the Council acceptance receipt have been verified.
 * Any GitHub failure, missing token, pagination ambiguity or changed file
 * fails closed. No user-supplied repository URL is accepted.
 */

export async function diagnoseUnchangedRepairDescendant({acceptedSha,deployedSha,protectedPaths,token,fetchImpl=fetch}={}) {
 const bad=diagnostic=>({ok:false,diagnostic});
 const validSha=x=>/^[a-f0-9]{40}$/.test(String(x||''));
 if(!validSha(acceptedSha)||!validSha(deployedSha)||acceptedSha===deployedSha
   ||!Array.isArray(protectedPaths)||!protectedPaths.length||protectedPaths.length>100
   ||protectedPaths.some(p=>typeof p!=='string'||p.length>240||p.startsWith('/')||p.split('/').some(x=>x==='..'||x==='.'||!x))
   ||typeof token!=='string'||token.length<8)return bad('REPAIR_COMPARE_INPUT_INVALID');
 try {
  const url='https://api.github.com/repos/adrienlopezcarreras-pixel/meliturgos-cloudflare/compare/'
    +acceptedSha+'...'+deployedSha;
  const res=await fetchImpl(url,{headers:{Authorization:'Bearer '+token,Accept:'application/vnd.github+json'},redirect:'error',signal:AbortSignal.timeout(15000)});
  if(!res.ok)return bad('REPAIR_COMPARE_HTTP_'+String(res.status).padStart(3,'0'));
  let data;
  try { data=await res.json(); }catch { return bad('REPAIR_COMPARE_JSON_INVALID'); }
  if(data?.status!=='ahead'||!Number.isInteger(data.ahead_by)||data.ahead_by<1||data.behind_by!==0)
   return bad('REPAIR_COMPARE_ANCESTRY_INVALID');
  // The GitHub Compare endpoint may return partial evidence. Refuse it.
  if(!Number.isInteger(data.total_commits)||data.total_commits<1||data.total_commits>250
    ||!Array.isArray(data.commits)||data.commits.length!==data.total_commits
    ||!Array.isArray(data.files)||data.files.length>=300)return bad('REPAIR_COMPARE_TRUNCATED');
  const protectedSet=new Set(protectedPaths);
  if(!data.files.every(file=>file&&typeof file.filename==='string'
    && !protectedSet.has(file.filename)
    && !(typeof file.previous_filename==='string'&&protectedSet.has(file.previous_filename))))
   return bad('REPAIR_COMPARE_PROTECTED_PATH_CHANGED');
  return {ok:true};
 }catch{return bad('REPAIR_COMPARE_FETCH_FAILED');}
}

// Keep the public boolean contract for existing callers; the production
// repair endpoint uses fixed-code diagnostics without exposing SHA or token.
export async function verifyUnchangedRepairDescendant(args={}) {
 return (await diagnoseUnchangedRepairDescendant(args)).ok===true;
}
