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
