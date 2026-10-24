import test from 'node:test';
import assert from 'node:assert/strict';
import {readMaintenanceFence,startMaintenanceLease,finishMaintenanceLease,withMaintenanceLease} from '../../src/maintenance/maintenance-gate.js';
import {retryPendingSubmissions,runScheduledMelWork} from '../../src/revenue/work-schedule.js';
const db=status=>({prepare(){return {bind(){return {first:async()=>status===null?null:{status,metadata_json:JSON.stringify({lease_id:'cycle-1',expires_at:5000})}}};}};});
test('temporary maintenance lease pauses until explicit release; expiry requires recovery',async()=>{
 assert.equal((await readMaintenanceFence(db(null),{now:100})).paused,false);
 assert.equal((await readMaintenanceFence(db('PAUSED'),{now:100})).reason,'MAINTENANCE_IN_PROGRESS');
 assert.equal((await readMaintenanceFence(db('PAUSED'),{now:6000})).reason,'EXPIRED_MAINTENANCE_REQUIRES_RECOVERY');
 assert.equal((await readMaintenanceFence({prepare(){throw Error('unavailable')}})).paused,true);
});
test('start and finish owner lease uses CAS and requires reconciled cleanup',async()=>{
 const calls=[];
 const store={prepare(sql){calls.push(sql);return {bind(...args){return {first:async()=>null,run:async()=>({meta:{changes:1}}),args}}};}};
 const lease=await startMaintenanceLease(store,{leaseId:'cycle-1',now:100,ttlMs:1000});
 assert.equal(lease.expires_at,1100);
 await assert.rejects(finishMaintenanceLease(store,{leaseId:'cycle-1'}),/RECONCILIATION/);
 assert.deepEqual(await finishMaintenanceLease(store,{leaseId:'cycle-1',reconciled:true,now:150}),{paused:false,released:true});
 assert.ok(calls.some(x=>x.includes("status='RUNNING'")));
});
test('WORK scheduler and submission retry are blocked by maintenance lease',async()=>{
 let called=0;
 const env={DB:db('PAUSED'),AI:{run:async()=>{called++;}}};
 assert.equal((await runScheduledMelWork(env)).status,'PAUSED_FOR_MAINTENANCE');
 assert.equal((await retryPendingSubmissions(env,{queue:async()=>{called++;}})).status,'PAUSED_FOR_MAINTENANCE');
 assert.equal(called,0);
});

test('maintenance lifecycle releases fence on verified success and recovered failure',async()=>{
 const records=[];
 const db={prepare(sql){records.push(sql);return {bind(){return {first:async()=>null,run:async()=>({meta:{changes:1}})}}}}};
 const done=await withMaintenanceLease(db,{leaseId:'x',now:()=>100,ttlMs:1000,run:async()=>({reconciled:true})});
 assert.equal(done.status,'COMPLETED');
 const recovered=await withMaintenanceLease(db,{leaseId:'y',now:()=>200,ttlMs:1000,run:async()=>{throw Error('job failed')},recover:async()=>({reconciled:true})});
 assert.equal(recovered.status,'RECOVERED');
 assert.equal(records.filter(sql=>sql.includes("status='RUNNING'")).length,2);
 await assert.rejects(withMaintenanceLease(db,{leaseId:'z',now:()=>300,ttlMs:1000,run:async()=>{throw Error('irrecoverable')}}),/irrecoverable/);
 assert.equal(records.filter(sql=>sql.includes("status='RUNNING'")).length,2);
});
