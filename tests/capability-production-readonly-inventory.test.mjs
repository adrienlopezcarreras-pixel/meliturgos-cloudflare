import test from 'node:test';
import assert from 'node:assert/strict';
import {assessInventory,probeLiveInventory,deriveParallelProof,READ_ONLY_ENDPOINTS}
  from '../scripts/prove-production-capability-inventory-readonly.mjs';

const SHA='a'.repeat(40);
const rows=Array.from({length:31},(_,i)=>({
  id:'offline.read.'+i,risk:i%3===0?'HIGH':'LOW',
  enabled:i%4!==0,health:i%5===0?'DEGRADED':'HEALTHY',
}));
const selfCheck={ok:true,deployed_sha:SHA,exact_deployment_identity_known:true};
const inventory={ok:true,health_refreshed:false,capabilities:rows};

test('no mutation endpoints are used by capability inventory proof',()=>{
  assert.deepEqual(READ_ONLY_ENDPOINTS,['/api/gen2/code/self-check','/api/gen2/capabilities']);
  assert.equal(READ_ONLY_ENDPOINTS.every(p=>!p.includes('?refresh=1')&&!p.includes('/execute')),true);
});
test('real GET-only inventory is truth-labeled, not executed capabilities',()=>{
  const proof=assessInventory(selfCheck,inventory,SHA);
  assert.equal(proof.ok,true);
  assert.equal(proof.capability_count,31);
  assert.equal(proof.capability_execution_tested,false);
  assert.equal(proof.stress_job_started,false);
  assert.equal(proof.mutation_scope,'GET_ONLY_ENDPOINTS_AUDIT_RECEIPTS_POSSIBLE');
  assert.equal(proof.low_risk_count+proof.protected_count,31);
});
test('wrong deployed SHA or absent exact identity blocks proof',()=>{
  assert.equal(assessInventory({...selfCheck,deployed_sha:'b'.repeat(40)},inventory,SHA).code,'CAPABILITY_INVENTORY_EXACT_DEPLOYMENT_NOT_PROVEN');
  assert.equal(assessInventory({...selfCheck,exact_deployment_identity_known:false},inventory,SHA).ok,false);
});
test('duplicate and missing inventory IDs cannot produce a green proof',()=>{
  let invalid={...inventory,capabilities:[...rows.slice(0,30),rows[0]]};
  assert.equal(assessInventory(selfCheck,invalid,SHA).code,'CAPABILITY_INVENTORY_DUPLICATE_OR_INVALID_ID');
  invalid={...inventory,capabilities:[...rows.slice(0,30),{...rows[30],id:''}]};
  assert.equal(assessInventory(selfCheck,invalid,SHA).ok,false);
});
test('a provider health refresh cannot be relabeled nonmutating',()=>{
  assert.equal(assessInventory(selfCheck,{...inventory,health_refreshed:true},SHA).code,'CAPABILITY_INVENTORY_INVALID_OR_REFRESHED');
});
test('live probe sends only two GETs and no credential to unauthorized host',async()=>{
  const visited=[];
  const f=async(url,opts)=>{
    visited.push({url,method:opts.method,redirect:opts.redirect});
    return Response.json(visited.length===1?selfCheck:inventory);
  };
  const output=await probeLiveInventory({token:'test',expectedSha:SHA,fetchImpl:f});
  assert.equal(output.ok,true);
  assert.equal(visited.length,2);
  assert.ok(visited.every(row=>row.method==='GET'&&row.redirect==='error'&&row.url.startsWith('https://meliturgos.adrien-lopezcarreras.workers.dev/api/gen2/')));
});
test('out-of-scope origin and missing credentials fail before any request',async()=>{
  let n=0;
  const f=async()=>{n++;throw Error('UNEXPECTED_REQUEST');};
  const result=await probeLiveInventory({token:'test',expectedSha:SHA,baseUrl:'https://evil.example',fetchImpl:f});
  assert.equal(result.ok,false);
  assert.equal(n,0);
  assert.throws(()=>deriveParallelProof('',SHA),/CAPABILITY_INVENTORY_PARALLEL_PROOF_INPUT_INVALID/);
});
