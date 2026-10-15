import test from 'node:test';
import assert from 'node:assert/strict';
import {
 evaluateOptionalCompute as decide,
 shouldInvalidateOptionalComputeTelemetryOnHeartbeat as invalidate,
} from '../../src/devices/companion-compute-admission.js';
test('optional compute fails closed and preserves MEL independence',()=>{
 for(const opts of [{},{enabled:false,profile:'performance',online:true,freeRamMb:10000},
  {enabled:true,profile:'unknown',online:true,freeRamMb:10000},
  {enabled:true,profile:'light',online:false,freeRamMb:10000},
  {enabled:true,profile:'light',online:true,halted:true,freeRamMb:10000},
  {enabled:true,profile:'light',online:true,onBattery:true,freeRamMb:10000},
  {enabled:true,profile:'light',online:true,userBusy:true,freeRamMb:10000},
  {enabled:true,profile:'light',online:true,freeRamMb:1024},
  {enabled:true,profile:'light',online:true,freeRamMb:10000,activeJobs:1}])
  assert.equal(decide(opts).allowed,false);
});
test('budgets bounded and GPU optional',()=>{
 const base={enabled:true,profile:'light',online:true,freeRamMb:8192};
 assert.deepEqual(decide(base),{allowed:true,reason:'ADMITTED',limits:{cpu_percent:15,ram_mb:1024,gpu_percent:0,max_jobs:1}});
 assert.equal(decide({...base,gpuAvailable:true}).limits.gpu_percent,20);
 assert.equal(decide({...base,profile:'performance',activeJobs:2}).allowed,false);
});

test('fresh local measurements required before admitting GPU work',async()=>{
 const {evaluateMeasuredOptionalCompute:decideMeasured}=await import('../../src/devices/companion-compute-admission.js');
 const now=100000;
 const request={enabled:true,profile:'light',online:true};
 const telemetry={observed_at:now,cpu_percent:20,free_ram_mb:8192,on_battery:false,user_busy:false,gpu_available:true,active_jobs:0};
 assert.equal(decideMeasured({...request,now}).allowed,false);
 assert.equal(decideMeasured({...request,now,telemetry:{...telemetry,observed_at:now-10001}}).reason,'COMPUTE_TELEMETRY_STALE');
 assert.equal(decideMeasured({...request,now,telemetry:{...telemetry,on_battery:null}}).reason,'COMPUTE_TELEMETRY_INVALID');
 assert.equal(decideMeasured({...request,now,telemetry:{...telemetry,cpu_percent:85}}).reason,'PC_CPU_BUSY');
 assert.equal(decideMeasured({...request,now,telemetry}).allowed,true);
 assert.equal(decideMeasured({...request,now,telemetry:{...telemetry,user_busy:true}}).allowed,false);
});

test('PowerShell engine heartbeat does not erase fresh Windows resource readings',()=>{
 // PowerShell sends engine_version and no telemetry; Windows sends version.
 assert.equal(invalidate({enabled:true,body:{engine_version:'1.4.1',local_compute_enabled:true}}),false);
 assert.equal(invalidate({enabled:true,body:{version:'1.2.3',local_compute_enabled:true}}),true);
 assert.equal(invalidate({enabled:true,body:{version:'1.2.3',local_compute_telemetry:{cpu_percent:5}}}),true);
 assert.equal(invalidate({enabled:true,body:{local_compute_telemetry:null}}),true);
 assert.equal(invalidate({enabled:true,body:{local_compute_telemetry:{cpu_percent:-5}}}),true);
 assert.equal(invalidate({enabled:false,body:{engine_version:'1.4.1'}}),true);
 assert.equal(invalidate({enabled:true,body:null}),true);
});
