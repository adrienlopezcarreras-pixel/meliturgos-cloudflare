import test from 'node:test';
import assert from 'node:assert/strict';
import { createCompanionSchedulerAdapter } from '../../src/portability/companion-scheduler-adapter.js';
import { createCompanionObservabilityAdapter } from '../../src/portability/companion-observability-adapter.js';
import { proveSchedulerAdapter } from '../../src/portability/scheduler-adapter.js';
import { proveObservabilityAdapter } from '../../src/portability/observability-adapter.js';

function schedulerExec(){
  const rows=new Map();
  return async({action,payload})=>{
    if(action==='health')return{ok:true,backend:'local-task-scheduler'};
    if(action==='create'){const id='s1';rows.set(id,{id,...payload});return{ok:true,id};}
    if(action==='list')return{ok:true,schedules:[...rows.values()].filter(x=>x.external_id===payload.external_id)};
    if(action==='pause'||action==='resume')return{ok:true};
    if(action==='trigger_now')return{ok:true,run_id:'run-1'};
    if(action==='delete'){rows.delete(payload.id);return{ok:true};}
    return{ok:false,code:'UNKNOWN_ACTION'};
  };
}

function obsExec(){
  const logs=[];const metrics=[];
  return async({action,payload})=>{
    if(action==='health')return{ok:true,backend:'local-jsonl'};
    if(action==='emit_log'){logs.push(payload);return{ok:true};}
    if(action==='emit_metric'){metrics.push(payload);return{ok:true};}
    if(action==='query_logs')return{ok:true,rows:logs.filter(x=>x.trace_id===payload.trace_id)};
    if(action==='query_metrics')return{ok:true,rows:metrics.filter(x=>x.trace_id===payload.trace_id)};
    if(action==='delete_test_data')return{ok:true};
    return{ok:false,code:'UNKNOWN_ACTION'};
  };
}

test('companion scheduler satisfies provider-neutral proof',async()=>{
  const proof=await proveSchedulerAdapter(createCompanionSchedulerAdapter({execute:schedulerExec()}));
  assert.equal(proof.ok,true);
  assert.equal(proof.provider,'local-companion-scheduler');
});

test('companion observability satisfies provider-neutral proof',async()=>{
  const proof=await proveObservabilityAdapter(createCompanionObservabilityAdapter({execute:obsExec()}));
  assert.equal(proof.ok,true);
  assert.equal(proof.provider,'local-companion-observability');
});

test('offline companion fails closed for both local layers',async()=>{
  const offline=async()=>({ok:false,code:'DEVICE_OFFLINE'});
  const scheduler=await createCompanionSchedulerAdapter({execute:offline}).health();
  const observability=await createCompanionObservabilityAdapter({execute:offline}).health();
  assert.equal(scheduler.ok,false);
  assert.equal(observability.ok,false);
  assert.equal(scheduler.code,'DEVICE_OFFLINE');
  assert.equal(observability.code,'DEVICE_OFFLINE');
});
