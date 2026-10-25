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
