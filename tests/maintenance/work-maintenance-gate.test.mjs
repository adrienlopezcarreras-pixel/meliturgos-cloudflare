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

test('maintenance orchestration releases lease only after verified outcome',async()=>{
 const sql=[];
 const store={prepare(q){sql.push(q);return {bind(){return {first:async()=>null,run:async()=>({meta:{changes:1}})}}}}};
 assert.equal((await withMaintenanceLease(store,{leaseId:'success',now:()=>100,ttlMs:1000,run:async()=>({reconciled:true})})).status,'COMPLETED');
 assert.equal((await withMaintenanceLease(store,{leaseId:'recover',now:()=>100,ttlMs:1000,run:async()=>{throw Error('failed')},recover:async()=>({reconciled:true})})).status,'RECOVERED');
 await assert.rejects(withMaintenanceLease(store,{leaseId:'unproven',now:()=>100,ttlMs:1000,run:async()=>{throw Error('bad')}}),/bad/);
 assert.equal(sql.filter(q=>q.includes("status='RUNNING'")).length,2);
});
