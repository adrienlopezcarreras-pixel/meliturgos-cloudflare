import test from 'node:test';
import assert from 'node:assert/strict';
import { executeGlobalMaintenance } from '../../src/maintenance/global-orchestrator.js';
import { RESET_SCOPES } from '../../src/maintenance/global-reset.js';
const props={
 restoreTestProof:{verified:true,isolated_restore_tested:true,reference:'isolated-test'},
 producerFenceProof:{verified:true,all_producers_stopped:true,reference:'fence-test'},
 domainProofs:Object.fromEntries(RESET_SCOPES.map(scope=>[scope,{tested:true,idempotent:true,generation_fenced:true}])),
};
const store = () => ({
  prepare() {
    return {
      first: async () => null,
      bind() {
        return {
          first: async () => null,
          run: async () => ({meta:{changes:1}}),
        };
      },
    };
  },
});
test('global maintenance refuses missing owner and unverifiable restore before mutation',async()=>{
 let invoked=0;
 const args={db:store(),leaseId:'test-1',ownerApproved:true,proofProvider:async()=>({}),
 handlers:Object.fromEntries(RESET_SCOPES.map(x=>[x,async()=>{invoked++;}])),
 stopProducers:async()=>{invoked++;},verifyProducersStopped:async()=>true,
 verifyFinalState:async()=>({independently_verified:true,reconciled:true}),
 recover:async()=>({})};
 await assert.rejects(executeGlobalMaintenance({...args,ownerApproved:false}),/OWNER_APPROVAL/);
 const blocked=await executeGlobalMaintenance(args);
 assert.equal(blocked.status,'BLOCKED');
 assert.equal(blocked.mutated,false);
 assert.equal(invoked,0);
});
test('global maintenance executes 7 handlers and releases only after independent check',async()=>{
 const order=[];
 const handlers=Object.fromEntries(RESET_SCOPES.map(scope=>[scope,async()=>{order.push(scope);return {completed:true};}]));
 const result=await executeGlobalMaintenance({
  db:store(),leaseId:'test-2',now:()=>100,ownerApproved:true,
  proofProvider:async()=>props,handlers,
  stopProducers:async()=>order.push('stop'),
  verifyProducersStopped:async()=>true,
  verifyFinalState:async()=>({independently_verified:true,reconciled:true}),
  recover:async()=>({reconciled:true})
 });
 assert.equal(result.status,'COMPLETED');
 assert.deepEqual(order,['stop',...RESET_SCOPES]);
});
test('global maintenance keeps fence when producer halt is unverified',async()=>{
 await assert.rejects(executeGlobalMaintenance({
  db:store(),leaseId:'test-3',now:()=>100,ownerApproved:true,
  proofProvider:async()=>props,
  handlers:Object.fromEntries(RESET_SCOPES.map(scope=>[scope,async()=>({})])),
  stopProducers:async()=>{},
  verifyProducersStopped:async()=>false,
  verifyFinalState:async()=>({independently_verified:false,reconciled:false}),
  recover:async()=>({reconciled:true})
 }),/INDEPENDENT_RECONCILIATION_REQUIRED/);
});

test('active WORK lease blocks orchestration before producer shutdown',async()=>{
 let stopped=false;
 const db={prepare(sql){
  if(sql.includes('sqlite_master')) return {first:async()=>({name:'work_dag_run_leases'})};
  if(sql.includes('COUNT(*)')) return {bind(){return {first:async()=>({n:1})}}};
  throw Error('unexpected query');
 }};
 await assert.rejects(executeGlobalMaintenance({
  db,leaseId:'lease-busy',now:()=>100,ownerApproved:true,
  proofProvider:async()=>props,
  handlers:Object.fromEntries(RESET_SCOPES.map(scope=>[scope,async()=>({})])),
  stopProducers:async()=>{stopped=true;},
  verifyProducersStopped:async()=>true,
  verifyFinalState:async()=>({independently_verified:true,reconciled:true}),
  recover:async()=>({reconciled:true})
 }),/WORK_LEASES_ACTIVE/);
 assert.equal(stopped,false);
});
