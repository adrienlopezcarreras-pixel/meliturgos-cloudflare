import test from 'node:test';
import assert from 'node:assert/strict';
import { SchedulerAdapter, proveSchedulerAdapter } from '../../src/portability/scheduler-adapter.js';

function scheduler(){
  const rows=new Map();
  return new SchedulerAdapter({
    id:'scheduler.alt',
    provider:'alternate-scheduler',
    health:async()=>({ok:true}),
    create:async({external_id,schedule,payload,enabled})=>{
      const id='sched-1';rows.set(id,{id,external_id,schedule,payload,enabled,paused:false});return{ok:true,id};
    },
    list:async({external_id})=>({ok:true,schedules:[...rows.values()].filter(x=>x.external_id===external_id)}),
    pause:async({id})=>{const row=rows.get(id);if(!row)return{ok:false};row.paused=true;return{ok:true};},
    resume:async({id})=>{const row=rows.get(id);if(!row)return{ok:false};row.paused=false;return{ok:true};},
    triggerNow:async({id})=>rows.has(id)?{ok:true,run_id:'run-1'}:{ok:false},
    deleteSchedule:async({id})=>{rows.delete(id);return{ok:true};},
  });
}

test('provider-neutral scheduler proof covers lifecycle and trigger',async()=>{
  const result=await proveSchedulerAdapter(scheduler());
  assert.equal(result.ok,true);
  assert.equal(result.status,'SCHEDULER_ADAPTER_VERIFIED');
  assert.equal(result.trigger_now,true);
});

test('scheduler proof fails closed when immediate trigger is unavailable',async()=>{
  const a=scheduler();
  a._trigger=async()=>({ok:false});
  const result=await proveSchedulerAdapter(a);
  assert.equal(result.ok,false);
  assert.equal(result.status,'SCHEDULER_TRIGGER_FAILED');
});
