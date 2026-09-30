import test from 'node:test';
import assert from 'node:assert/strict';
import { createAlternativeRegistry } from '../../src/portability/prevalidated-alternative-registry.js';
import { planSovereigntyGapClosure } from '../../src/portability/sovereignty-gap-planner.js';

const now=Date.UTC(2026,8,28,18,0,0);
const proof={
  isolated_test:true,smoke:true,rollback:true,export:true,import:true,activate:true,
  verified_at:new Date(now-1000).toISOString(),
  expires_at:new Date(now+86400000).toISOString(),
  evidence_ref:'ci://proof',source_sha:'a'.repeat(40),
};

test('gap planner prioritizes first uncovered sovereignty layer',()=>{
  const registry=createAlternativeRegistry([
    {id:'ai.alt',layer:'ai',provider:'alt-ai',added_cost_eur:0,proof},
    {id:'backup.alt',layer:'backup_restore',provider:'drive',added_cost_eur:0,proof},
  ],{now});
  const plan=planSovereigntyGapClosure({registry,now});
  assert.equal(plan.fully_covered,false);
  assert.equal(plan.covered_count,2);
  assert.equal(plan.next_layer,'runtime');
  assert.equal(plan.next_action,'CONTINUE_SOVEREIGNTY_WATCH');
});

test('watch candidates turn no-provider gap into configure-and-prevalidate action',()=>{
  const registry=createAlternativeRegistry([],{now});
  const plan=planSovereigntyGapClosure({
    registry,
    now,
    watchReport:{
      results:[{
        layer:'runtime',
        candidate_hints:[{id:'runtime.example',provider_hint:'runtime.example',status:'UNVERIFIED',source_url:'https://runtime.example/docs'}],
      }],
    },
  });
  const runtime=plan.blocked_layers.find(x=>x.layer==='runtime');
  assert.equal(runtime.blocking_reason,'PROVIDER_NOT_CONFIGURED');
  assert.equal(runtime.next_action,'CONFIGURE_AND_PREVALIDATE_CANDIDATE');
  assert.equal(runtime.candidate_hints[0].id,'runtime.example');
});

test('expired proof becomes explicit revalidation blocker',()=>{
  const expired={...proof,expires_at:new Date(now-1).toISOString()};
  const registry=createAlternativeRegistry([
    {id:'git.alt',layer:'source_control',provider:'alt-git',added_cost_eur:0,proof:expired},
  ],{now});
  const plan=planSovereigntyGapClosure({registry,now});
  const git=plan.blocked_layers.find(x=>x.layer==='source_control');
  assert.equal(git.blocking_reason,'PROOF_EXPIRED');
  assert.equal(git.next_action,'REVALIDATE_PROVIDER');
});

test('all ten fresh alternatives closes the sovereignty gap plan',()=>{
  const layers=['ai','runtime','storage','database','source_control','ci_cd','secrets_identity','scheduler','observability','backup_restore'];
  const registry=createAlternativeRegistry(layers.map((layer,i)=>({
    id:'alt.'+i,layer,provider:'p.'+i,added_cost_eur:0,proof,
  })),{now});
  const plan=planSovereigntyGapClosure({registry,now});
  assert.equal(plan.fully_covered,true);
  assert.equal(plan.covered_count,10);
  assert.equal(plan.blocked_count,0);
  assert.equal(plan.next_layer,null);
});
