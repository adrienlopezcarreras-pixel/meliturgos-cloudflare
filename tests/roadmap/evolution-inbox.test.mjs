import test from 'node:test';
import assert from 'node:assert/strict';
import {proposeEvolution,transitionEvolution,evolutionSnapshot,isValidEvolutionId} from '../../src/roadmap/evolution-inbox.js';
test('initial percentage stays fixed when new work is proposed',()=>{
 const base={total:100,verified:100};
 const first=proposeEvolution([],{id:'EV-1',title:'New capability',origin:'mel'});
 const duplicate=proposeEvolution(first.items,{id:'EV-2',title:'new   capability!',origin:'audit'});
 assert.equal(duplicate.created,false);assert.equal(duplicate.duplicate_of,'EV-1');
 const snapshot=evolutionSnapshot({initial:base,items:first.items,incidents:[{resolved:false}]});
 assert.equal(snapshot.initial.percent_verified,100);assert.equal(snapshot.evolution.proposed,1);assert.equal(snapshot.health.active_incidents,1);
});
test('no verification without SHA and real evidence',()=>{
 let i=proposeEvolution([],{id:'EV-1',title:'New capability',origin:'user'}).item;
 for(const status of ['TRIAGED','APPROVED','IN_PROGRESS','IMPLEMENTED','TESTING']) i=transitionEvolution(i,status);
 assert.throws(()=>transitionEvolution(i,'DONE_VERIFIED'),/EVOLUTION_MISSING_VERIFICATION/);
 i=transitionEvolution(i,'DONE_VERIFIED',{proof:{sha:'a'.repeat(40),ci_passed:true,real_test_passed:true,environment:'production',reference:'run/1'}});
 assert.equal(i.evidence.length,1);assert.equal(transitionEvolution(i,'REGRESSED').status,'REGRESSED');
 assert.throws(()=>transitionEvolution(i,'PROPOSED'),/EVOLUTION_INVALID_TRANSITION/);
});
test('invalid and colliding proposals fail closed',()=>{
 assert.throws(()=>proposeEvolution([],{id:'X',title:' ',origin:'mel'}),/EVOLUTION_INVALID_PROPOSAL/);
 const items=proposeEvolution([],{id:'X',title:'Something',origin:'mel'}).items;
 assert.throws(()=>proposeEvolution(items,{id:'X',title:'Other',origin:'mel'}),/EVOLUTION_DUPLICATE_ID/);
});

test('health telemetry is unknown until connected, distinct from known regressions',()=>{
 const initial={total:3,verified:3};
 let item=proposeEvolution([],{id:'E-6',title:'Restore voice answer',origin:'audit'}).item;
 for(const state of ['TRIAGED','APPROVED','IN_PROGRESS','IMPLEMENTED','TESTING']){
  item=transitionEvolution(item,state);
 }
 item=transitionEvolution(item,'DONE_VERIFIED',{proof:{sha:'c'.repeat(40),ci_passed:true,real_test_passed:true,environment:'prod',reference:'run/123'}});
 item=transitionEvolution(item,'REGRESSED');
 const unknown=evolutionSnapshot({initial,items:[item]});
 assert.equal(unknown.initial.percent_verified,100);
 assert.equal(unknown.health.status,'NOT_CONNECTED');
 assert.equal(unknown.health.active_incidents,null);
 assert.equal(unknown.health.regressed_items,1);
 const real=evolutionSnapshot({initial,items:[item],incidents:[{resolved:false},{resolved:true}]});
 assert.equal(real.health.status,'CONNECTED');
 assert.equal(real.health.active_incidents,1);
 assert.equal(real.health.regressed_items,1);
 const empty=evolutionSnapshot({initial,items:[],incidents:[]});
 assert.equal(empty.health.status,'CONNECTED');
 assert.equal(empty.health.active_incidents,0);
});

test('proposal ID contract exactly matches IDs schedulable by autonomy',()=>{
 const ids=['A','EVOL-cryo-1','a'.repeat(70)];
 for(const id of ids){
  assert.equal(isValidEvolutionId(id),true);
  assert.equal(proposeEvolution([],{id,title:'Missing feature',origin:'mel'}).item.id,id);
 }
 for(const id of ['new feature','bad.id','bad/id','-prefix','a'.repeat(71),'évolution', '']){
  assert.equal(isValidEvolutionId(id),false);
  assert.throws(()=>proposeEvolution([],{id,title:'Missing feature',origin:'mel'}),/EVOLUTION_INVALID_PROPOSAL/);
 }
});

test('DONE_VERIFIED proof must be actual affirmative booleans, not truthy strings',()=>{
 let i=proposeEvolution([],{id:'EV-STRICT-1',title:'Measure production voice latency',origin:'audit'}).item;
 for(const state of ['TRIAGED','APPROVED','IN_PROGRESS','IMPLEMENTED','TESTING'])i=transitionEvolution(i,state);
 const valid={sha:'a'.repeat(40),ci_passed:true,real_test_passed:true,environment:'production',reference:'actions/runs/123'};
 for(const invalid of [
  {...valid,ci_passed:'false'},
  {...valid,real_test_passed:'false'},
  {...valid,ci_passed:1},
  {...valid,real_test_passed:1},
  {...valid,sha:{toString:()=> 'a'.repeat(40)}},
  {...valid,environment:'   '},
  {...valid,reference:'  '}
 ]) assert.throws(()=>transitionEvolution(i,'DONE_VERIFIED',{proof:invalid}),/EVOLUTION_MISSING_VERIFICATION/);
 const verified=transitionEvolution(i,'DONE_VERIFIED',{proof:valid});
 assert.equal(verified.status,'DONE_VERIFIED');
 assert.equal(verified.evidence[0].ci_passed,true);
});
