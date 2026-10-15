import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateOptionalCompute as decide} from '../../src/devices/companion-compute-admission.js';
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
