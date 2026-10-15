// Admission policy for OPTIONAL Companion compute. No execution or GPU access here.
// A client must opt in locally; a remote caller cannot elevate resources.
export const COMPANION_COMPUTE_PROFILES=Object.freeze({
 off:Object.freeze({cpu_percent:0,ram_mb:0,gpu_percent:0,max_jobs:0}),
 light:Object.freeze({cpu_percent:15,ram_mb:1024,gpu_percent:20,max_jobs:1}),
 balanced:Object.freeze({cpu_percent:35,ram_mb:3072,gpu_percent:40,max_jobs:1}),
 performance:Object.freeze({cpu_percent:60,ram_mb:6144,gpu_percent:65,max_jobs:2})
});
export function evaluateOptionalCompute({enabled=false,profile='off',online=false,halted=false,
  onBattery=false,userBusy=false,freeRamMb=0,gpuAvailable=false,activeJobs=0}={}){
 const limits=COMPANION_COMPUTE_PROFILES[profile];
 if(enabled!==true)return {allowed:false,reason:'LOCAL_COMPUTE_DISABLED'};
 if(!limits||profile==='off')return {allowed:false,reason:'COMPUTE_PROFILE_DISABLED'};
 if(!online||halted)return {allowed:false,reason:'COMPANION_UNAVAILABLE'};
 if(onBattery||userBusy)return {allowed:false,reason:'PC_PRIORITY'};
 if(!Number.isFinite(freeRamMb)||freeRamMb<limits.ram_mb+1024)return {allowed:false,reason:'INSUFFICIENT_FREE_RAM'};
 if(!Number.isSafeInteger(activeJobs)||activeJobs<0||activeJobs>=limits.max_jobs)return {allowed:false,reason:'COMPUTE_BUSY'};
 return {allowed:true,reason:'ADMITTED',limits:{...limits,gpu_percent:gpuAvailable===true?limits.gpu_percent:0}};
}

/**
 * Only real and fresh local Windows measurements may authorize useful compute.
 * Missing telemetry must never be interpreted as an idle machine.
 */
export function evaluateMeasuredOptionalCompute({telemetry,now=Date.now(),...request}={}){
 if(!telemetry||typeof telemetry!=='object'||!Number.isFinite(now))
  return {allowed:false,reason:'COMPUTE_TELEMETRY_MISSING'};
 const {observed_at,cpu_percent,free_ram_mb,on_battery,user_busy,gpu_available,active_jobs}=telemetry;
 if(!Number.isFinite(observed_at)||observed_at>now||now-observed_at>10000)
  return {allowed:false,reason:'COMPUTE_TELEMETRY_STALE'};
 if(!Number.isFinite(cpu_percent)||cpu_percent<0||cpu_percent>100||
    typeof on_battery!=='boolean'||typeof user_busy!=='boolean'||
    typeof gpu_available!=='boolean')
  return {allowed:false,reason:'COMPUTE_TELEMETRY_INVALID'};
 if(cpu_percent>=70)return {allowed:false,reason:'PC_CPU_BUSY'};
 return evaluateOptionalCompute({...request,onBattery:on_battery,userBusy:user_busy,
   freeRamMb:free_ram_mb,gpuAvailable:gpu_available,activeJobs:active_jobs});
}

/**
 * Companion has TWO authenticated heartbeat senders. The native Windows
 * supervisor (version field) owns resource samples; PowerShell (engine_version)
 * reports engine health but has no resource probe. Missing PowerShell telemetry
 * must not destroy a valid native CPU/RAM sample, while native failures,
 * explicit invalid telemetry or revoked opt-in must always fail closed.
 */
export function shouldInvalidateOptionalComputeTelemetryOnHeartbeat({
 enabled=false,body={}
}={}){
 if(enabled!==true)return true;
 if(!body||typeof body!=='object')return true;
 return Object.prototype.hasOwnProperty.call(body,'version')
   || Object.prototype.hasOwnProperty.call(body,'local_compute_telemetry');
}

/**
 * Re-check live consent, telemetry and deadline when Windows CLAIMS a queued
 * Ollama action, not only when the server first puts it in the queue.
 * Other command types keep their existing security policies unchanged.
 */
export function evaluateQueuedOptionalComputeClaim({plan,device,now=Date.now()}={}){
 const steps=Array.isArray(plan?.steps)?plan.steps:[];
 const hasAiInvoke=steps.some(step=>step?.action==='sovereignty.ai.invoke');
 if(!hasAiInvoke)return {ok:true,reason:'NOT_OPTIONAL_AI'};
 if(plan?.schema!=='mel.sovereignty.local-command/v1'||steps.length!==1)
   return {ok:false,code:'LOCAL_AI_PLAN_INVALID'};
 const deadline=steps[0]?.payload?.owner_inference_deadline_ms;
 if(typeof deadline!=='number'||!Number.isSafeInteger(deadline)||
   deadline<=now||deadline>now+120000)
   return {ok:false,code:'LOCAL_AI_REQUEST_EXPIRED'};
 if(!device||Number(device.halted)===1)
   return {ok:false,code:'LOCAL_AI_OWNER_HALT'};
 let metadata={};
 try{metadata=typeof device.metadata==='string'?JSON.parse(device.metadata):device.metadata||{}}catch{}
 const engineHeartbeat=Number(metadata.engine_heartbeat_at);
 if(!Number.isFinite(engineHeartbeat)||engineHeartbeat>now||now-engineHeartbeat>=35000)
   return {ok:false,code:'LOCAL_AI_ENGINE_OFFLINE'};
 const admission=evaluateMeasuredOptionalCompute({
   enabled:metadata.local_compute_enabled===true,
   profile:metadata.local_compute_profile||'off',online:true,
   halted:false,now,telemetry:metadata.local_compute_telemetry
 });
 return admission.allowed===true
   ?{ok:true,reason:'LOCAL_AI_ADMITTED'}
   :{ok:false,code:'LOCAL_AI_'+admission.reason};
}
