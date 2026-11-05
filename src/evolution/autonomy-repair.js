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
export async function completeVerifiedRepair(db,repository,{deployedSha,releaseVerified=false,memoryState=null}={}) {
 const control=await getAutonomyControl(db,{memoryState});
 if(control.paused===true || control.max_autonomy!==true)return {ok:true,status:'REPAIR_OWNER_STOP_PRESERVED',resumed:false};
 const lane=repairLane(control);
 if(!lane)return control.repair||control.repair_invalid?{ok:false,status:'AUTONOMY_REPAIR_SCOPE_INVALID',resumed:false}:{ok:true,status:'REPAIR_NOT_NEEDED',resumed:false};
 const job=await repository.get(lane.job_id);
 if(releaseVerified!==true || !isAcceptedRoadmapCodeJob(job)
   || job.result_json.roadmap_code_acceptance.candidate_sha!==deployedSha)
  return {ok:false,status:'REPAIR_DELIVERY_NOT_VERIFIED',resumed:false};
 const updated=await setAutonomyControl(db,{paused:false,max_autonomy:true,source:'verified-repair-completed',reason:'verified-repair-delivered',repair:null,expected_updated_at:control.updated_at,memoryState});
 return {ok:true,status:'AUTONOMOUS_REPAIR_COMPLETED',resumed:true,control:updated};
}
