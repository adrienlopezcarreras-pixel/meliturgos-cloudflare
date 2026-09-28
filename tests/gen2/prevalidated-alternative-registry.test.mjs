import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createAlternativeRegistry,
  eligibleAlternatives,
  sovereigntyCoverageFromRegistry,
} from '../../src/portability/prevalidated-alternative-registry.js';

const now=Date.UTC(2026,8,28,18,0,0);

function proof(overrides={}){
  return {
    isolated_test:true,
    smoke:true,
    rollback:true,
    export:true,
    import:true,
    activate:true,
    verified_at:new Date(now-3600000).toISOString(),
    expires_at:new Date(now+30*24*3600000).toISOString(),
    evidence_ref:'ci://proof',
    source_sha:'a'.repeat(40),
    ...overrides,
  };
}

test('only complete fresh alternatives are eligible for unattended failover',()=>{
  const registry=createAlternativeRegistry([
    {id:'runtime.good',layer:'runtime',provider:'alt',added_cost_eur:0,proof:proof()},
    {id:'runtime.expired',layer:'runtime',provider:'old',added_cost_eur:0,proof:proof({expires_at:new Date(now-1).toISOString()})},
    {id:'runtime.partial',layer:'runtime',provider:'partial',added_cost_eur:0,proof:proof({rollback:false})},
  ]);
  assert.deepEqual(
    eligibleAlternatives(registry,'runtime',{maxAddedCostEur:0,now}).map(x=>x.id),
    ['runtime.good'],
  );
});

test('unknown-cost alternatives are not silently selected under zero-cost policy',()=>{
  const registry=createAlternativeRegistry([
    {id:'ai.unknown',layer:'ai',provider:'alt',proof:proof()},
    {id:'ai.free',layer:'ai',provider:'free',added_cost_eur:0,proof:proof()},
  ]);
  assert.deepEqual(
    eligibleAlternatives(registry,'ai',{maxAddedCostEur:0,now}).map(x=>x.id),
    ['ai.free'],
  );
});

test('coverage stays incomplete until all sovereignty layers have at least one prevalidated alternative',()=>{
  const registry=createAlternativeRegistry([
    {id:'backup.gdrive',layer:'backup_restore',provider:'google-drive',added_cost_eur:0,proof:proof()},
    {id:'ai.alt',layer:'ai',provider:'alternate-ai',added_cost_eur:0,proof:proof()},
  ]);
  const coverage=sovereigntyCoverageFromRegistry(registry);
  assert.equal(coverage.fully_covered,false);
  assert.ok(coverage.covered_layers.includes('ai'));
  assert.ok(coverage.covered_layers.includes('backup_restore'));
  assert.ok(coverage.uncovered_layers.includes('runtime'));
  assert.ok(coverage.uncovered_layers.includes('source_control'));
});

test('proof expiration automatically removes an alternative from eligible set',()=>{
  const registry=createAlternativeRegistry([
    {id:'git.alt',layer:'source_control',provider:'git-alt',added_cost_eur:0,proof:proof()},
  ]);
  assert.equal(eligibleAlternatives(registry,'source_control',{now}).length,1);
  assert.equal(eligibleAlternatives(registry,'source_control',{now:now+31*24*3600000}).length,0);
});


test('AI sovereignty reports whether a fresh low-refusal rescue model exists',()=>{
  const registry=createAlternativeRegistry([
    {id:'ai.standard',layer:'ai',provider:'p1',added_cost_eur:0,low_refusal:false,policy_profile:'STANDARD',proof:proof()},
    {id:'ai.uncensored',layer:'ai',provider:'p2',added_cost_eur:0,low_refusal:true,policy_profile:'LOW_REFUSAL',proof:proof()},
  ],{now});
  const coverage=sovereigntyCoverageFromRegistry(registry,{now});
  assert.equal(coverage.coverage.ai.ready,true);
  assert.equal(coverage.ai_low_refusal_ready,true);

  const without=createAlternativeRegistry([
    {id:'ai.standard',layer:'ai',provider:'p1',added_cost_eur:0,low_refusal:false,policy_profile:'STANDARD',proof:proof()},
  ],{now});
  const missing=sovereigntyCoverageFromRegistry(without,{now});
  assert.equal(missing.coverage.ai.ready,true);
  assert.equal(missing.ai_low_refusal_ready,false);
});
