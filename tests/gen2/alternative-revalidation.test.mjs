import test from 'node:test';
import assert from 'node:assert/strict';
import { createAlternativeRegistry, eligibleAlternatives } from '../../src/portability/prevalidated-alternative-registry.js';
import { dueAlternatives, revalidateAlternativeRegistry } from '../../src/portability/alternative-revalidation.js';

const now=Date.UTC(2026,8,28,18,0,0);
const proof={
  isolated_test:true,smoke:true,rollback:true,export:true,import:true,activate:true,
  verified_at:new Date(now-5*24*3600000).toISOString(),
  expires_at:new Date(now+2*24*3600000).toISOString(),
  evidence_ref:'ci://old',source_sha:'a'.repeat(40),
};

test('alternative becomes due before proof expiration',()=>{
  const registry=createAlternativeRegistry([{id:'runtime.alt',layer:'runtime',provider:'alt',added_cost_eur:0,proof}]);
  assert.deepEqual(dueAlternatives(registry,{now,refreshBeforeMs:7*24*3600000}).map(x=>x.id),['runtime.alt']);
});

test('successful revalidation renews proof and keeps emergency eligibility',async()=>{
  const registry=createAlternativeRegistry([{id:'runtime.alt',layer:'runtime',provider:'alt',added_cost_eur:0,proof}]);
  const result=await revalidateAlternativeRegistry({
    registry,now,ttlMs:30*24*3600000,
    verify:async()=>({ok:true,evidence_ref:'ci://new',source_sha:'b'.repeat(40)}),
  });
  assert.equal(result.revalidated_count,1);
  const row=result.registry.layers.runtime[0];
  assert.equal(row.prevalidated,true);
  assert.equal(row.proof.evidence_ref,'ci://new');
  assert.equal(row.proof.source_sha,'b'.repeat(40));
  assert.equal(eligibleAlternatives(result.registry,'runtime',{now}).length,1);
});

test('failed revalidation immediately removes provider from emergency eligibility',async()=>{
  const registry=createAlternativeRegistry([{id:'git.alt',layer:'source_control',provider:'alt-git',added_cost_eur:0,proof}]);
  const result=await revalidateAlternativeRegistry({
    registry,now,
    verify:async()=>({ok:false,code:'WRITE_SMOKE_FAILED'}),
  });
  assert.equal(result.invalidated_count,1);
  assert.equal(result.registry.layers.source_control[0].prevalidated,false);
  assert.equal(eligibleAlternatives(result.registry,'source_control',{now}).length,0);
  assert.equal(result.results[0].code,'WRITE_SMOKE_FAILED');
});

test('revalidation failure is isolated per alternative',async()=>{
  const registry=createAlternativeRegistry([
    {id:'ai.a',layer:'ai',provider:'a',added_cost_eur:0,proof},
    {id:'ai.b',layer:'ai',provider:'b',added_cost_eur:0,proof},
  ]);
  const result=await revalidateAlternativeRegistry({
    registry,now,
    verify:async row=>{
      if(row.id==='ai.a') throw new Error('network down');
      return {ok:true,evidence_ref:'ci://b'};
    },
  });
  assert.equal(result.revalidated_count,1);
  assert.equal(result.invalidated_count,1);
  assert.deepEqual(eligibleAlternatives(result.registry,'ai',{now}).map(x=>x.id),['ai.b']);
});
