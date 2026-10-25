import test from 'node:test';
import assert from 'node:assert/strict';
import { sqliteD1 } from '../helpers/sqlite-d1.mjs';
import { executeGlobalMaintenance } from '../../src/maintenance/global-orchestrator.js';
import { RESET_SCOPES } from '../../src/maintenance/global-reset.js';
import { checkpointMaintenanceLease, startMaintenanceLease, finishMaintenanceLease, readMaintenanceFence, MAINTENANCE_FENCE_ID } from '../../src/maintenance/maintenance-gate.js';

async function fixture() {
  const db=sqliteD1();
  await db.prepare('CREATE TABLE dev_bridge_state(bridge_id TEXT PRIMARY KEY,last_seen INTEGER,status TEXT,metadata_json TEXT)').run();
  return db;
}
const proofs={restoreTestProof:{verified:true,isolated_restore_tested:true,reference:'local-fixture'},producerFenceProof:{verified:true,all_producers_stopped:true,reference:'local-fixture'},domainProofs:Object.fromEntries(RESET_SCOPES.map(scope=>[scope,{tested:true,idempotent:true,generation_fenced:true}]))};
async function metadata(db) {
  return JSON.parse((await db.prepare('SELECT metadata_json FROM dev_bridge_state WHERE bridge_id=?').bind(MAINTENANCE_FENCE_ID).first()).metadata_json);
}

test('real SQL checkpoint fences expired and foreign owners without changing durable progress',async()=>{
  const db=await fixture();
  try {
    await startMaintenanceLease(db,{leaseId:'owner',now:100,ttlMs:1000});
    await checkpointMaintenanceLease(db,{leaseId:'owner',phase:'RESET_STARTED',scope:'MAX',now:101});
    const before=await metadata(db);
    await assert.rejects(checkpointMaintenanceLease(db,{leaseId:'other',phase:'RESET_COMPLETED',scope:'MAX',now:102}),/EXPIRED_OR_LOST/);
    await assert.rejects(checkpointMaintenanceLease(db,{leaseId:'owner',phase:'RESET_COMPLETED',scope:'MAX',now:1100}),/EXPIRED_OR_LOST/);
    assert.deepEqual(await metadata(db),before);
    assert.equal((await readMaintenanceFence(db,{now:1100})).reason,'EXPIRED_MAINTENANCE_REQUIRES_RECOVERY');
    await assert.rejects(finishMaintenanceLease(db,{leaseId:'owner',now:1101}),/RECONCILIATION_REQUIRED/);
    await finishMaintenanceLease(db,{leaseId:'owner',reconciled:true,now:1102});
    assert.equal((await readMaintenanceFence(db,{now:1103})).paused,false);
    assert.equal((await metadata(db)).phase,'RESET_STARTED');
  } finally {db.close();}
});

test('interrupted domain leaves durable exact step and never runs remaining domains',async()=>{
  const db=await fixture();
  const invoked=[];
  try {
    await assert.rejects(executeGlobalMaintenance({db,leaseId:'interrupted',now:()=>100,ownerApproved:true,proofProvider:async()=>proofs,
      stopProducers:async()=>{},verifyProducersStopped:async()=>true,
      handlers:Object.fromEntries(RESET_SCOPES.map(scope=>[scope,async()=>{invoked.push(scope);if(scope==='WORK')throw Error('interrupted');}])),
      recover:async()=>{throw Error('recovery-unavailable');},verifyFinalState:async()=>({independently_verified:false,reconciled:false})
    }),/recovery-unavailable/);
    assert.deepEqual(invoked,['MAX','WORK']);
    assert.equal((await metadata(db)).phase,'RESET_STARTED');
    assert.equal((await metadata(db)).scope,'WORK');
    assert.equal((await readMaintenanceFence(db,{now:101})).paused,true);
  } finally {db.close();}
});

test('expiry between handlers stops subsequent reset mutations and requires independent recovery',async()=>{
 const db=await fixture();let clock=100;const invoked=[];
 try {
  await assert.rejects(executeGlobalMaintenance({db,leaseId:'expires',now:()=>clock,ownerApproved:true,proofProvider:async()=>proofs,
   stopProducers:async()=>{},verifyProducersStopped:async()=>true,
   handlers:Object.fromEntries(RESET_SCOPES.map(scope=>[scope,async()=>{invoked.push(scope);clock=3600100;}])),
   recover:async()=>({reconciled:true}),verifyFinalState:async()=>({independently_verified:false,reconciled:false})
  }),/INDEPENDENT_RECONCILIATION_REQUIRED/);
  assert.deepEqual(invoked,['MAX']);
  assert.equal((await metadata(db)).phase,'RESET_STARTED');
  assert.equal((await readMaintenanceFence(db,{now:clock})).reason,'EXPIRED_MAINTENANCE_REQUIRES_RECOVERY');
 } finally {db.close();}
});

test('cold maintenance obtains stop evidence after acquiring its fence, not before stopping producers',async()=>{
 const db=await fixture();let stopped=false,reads=0;const order=[];
 try {
  const result=await executeGlobalMaintenance({db,leaseId:'cold-start',now:()=>100,ownerApproved:true,
   proofProvider:async()=>{reads++;order.push(stopped?'proof-stopped':'proof-running');return {...proofs,producerFenceProof:stopped?proofs.producerFenceProof:null};},
   stopProducers:async()=>{assert.equal((await readMaintenanceFence(db,{now:100})).paused,true);stopped=true;order.push('stop');},
   verifyProducersStopped:async()=>{order.push('verify-stop');return stopped;},
   handlers:Object.fromEntries(RESET_SCOPES.map(scope=>[scope,async()=>{order.push(scope);}])),
   recover:async()=>{throw Error('UNEXPECTED_RECOVERY');},
   verifyFinalState:async()=>({independently_verified:true,reconciled:true})
  });
  assert.equal(result.status,'COMPLETED');assert.equal(reads,2);
  assert.deepEqual(order,['proof-running','stop','verify-stop','proof-stopped',...RESET_SCOPES]);
  assert.equal((await readMaintenanceFence(db,{now:101})).paused,false);
 }finally{db.close();}
});

test('fresh post-stop proof failures prevent every reset and retain the fence until verified recovery',async()=>{
 for(const failure of ['producer','restore','domain','unavailable']){
  const db=await fixture();let stopped=false,reads=0,resets=0,recoveryError;
  try {
   await assert.rejects(executeGlobalMaintenance({db,leaseId:'fresh-'+failure,now:()=>100,ownerApproved:true,
    proofProvider:async()=>{
     reads++;
     if(!stopped)return {...proofs,producerFenceProof:null};
     if(failure==='unavailable')throw Error('PROOF_STORE_UNAVAILABLE');
     return {...proofs,...(failure==='producer'?{producerFenceProof:null}:failure==='restore'?{restoreTestProof:null}:{domainProofs:{}})};
    },
    stopProducers:async()=>{stopped=true;},verifyProducersStopped:async()=>true,
    handlers:Object.fromEntries(RESET_SCOPES.map(scope=>[scope,async()=>{resets++;}])),
    recover:async error=>{recoveryError=error;return {reconciled:false};},
    verifyFinalState:async()=>({independently_verified:false,reconciled:false})
   }),/INDEPENDENT_RECONCILIATION_REQUIRED/);
   assert.equal(reads,2);assert.equal(resets,0);assert.ok(recoveryError);
   assert.equal((await readMaintenanceFence(db,{now:101})).paused,true);
   assert.equal((await metadata(db)).phase,'STOPPING_PRODUCERS');
  }finally{db.close();}
 }
});

test('missing restore or domain evidence still blocks before any maintenance fence or shutdown',async()=>{
 for(const missing of ['restoreTestProof','domainProofs']){
  const db=await fixture();let stopped=false;
  try{
   const result=await executeGlobalMaintenance({db,leaseId:'static-missing',now:()=>100,ownerApproved:true,
    proofProvider:async()=>({...proofs,producerFenceProof:null,[missing]:null}),
    stopProducers:async()=>{stopped=true;},verifyProducersStopped:async()=>true,
    handlers:Object.fromEntries(RESET_SCOPES.map(scope=>[scope,async()=>{throw Error('RESET_FORBIDDEN');}])),
    recover:async()=>({}),verifyFinalState:async()=>({independently_verified:false,reconciled:false})
   });
   assert.equal(result.status,'BLOCKED');assert.equal(result.mutated,false);assert.equal(stopped,false);
   assert.equal(await db.prepare('SELECT * FROM dev_bridge_state').first(),null);
  }finally{db.close();}
 }
});
