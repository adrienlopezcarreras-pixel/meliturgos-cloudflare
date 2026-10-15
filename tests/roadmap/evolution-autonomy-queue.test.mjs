import test from 'node:test';
import assert from 'node:assert/strict';
import { D1DevJobRepository } from '../../src/dev/d1-dev-job-repository.js';
import { AutonomySupervisor } from '../../src/evolution/autonomy-supervisor.js';
import { approvedEvolutionRoadmap } from '../../src/roadmap/evolution-autonomy-queue.js';
const repo=()=>new D1DevJobRepository(null,{memoryStore:new Map()});
const initial=[{id:'BASE',title:'Initial priority',priority:'P3',status:'PLANNED',phase_id:'P0'}];
const backlog=[
 {id:'NEW-1',title:'Improve assistant latency',status:'PROPOSED',priority:'P0'},
 {id:'NEW-2',title:'Repair response quality',status:'APPROVED',priority:'P1'},
 {id:'NEW-3',title:'Fix regressed voice',status:'REGRESSED',priority:'P0'},
 {id:'NEW-4',title:'Finished work',status:'DONE_VERIFIED',priority:'P0'}
];
test('unapproved, verified and blocked proposals cannot enter autonomy',()=>{
 const items=approvedEvolutionRoadmap(backlog);
 assert.deepEqual(items.map(x=>x.id),['EVOLUTION-NEW-2','EVOLUTION-NEW-3']);
 assert.equal(items[0].status,'PLANNED');
 assert.equal(items[1].status,'PARTIAL');
 assert.throws(()=>approvedEvolutionRoadmap([{id:'bad.1',title:'Collision',status:'APPROVED'}]),/EVOLUTION_QUEUE_INVALID_APPROVED_ITEM/);
 assert.throws(()=>approvedEvolutionRoadmap([{id:'FOO',title:'Valid',status:'APPROVED'},{id:'foo',title:'valid',status:'APPROVED'}]),/EVOLUTION_QUEUE_DUPLICATE_ID/);
});
test('initial roadmap keeps priority before approved evolving work',async()=>{
 const r=repo(); const s=new AutonomySupervisor({repository:r,roadmap:initial,evolutionLoader:async()=>backlog});
 const state=await s.state();
 assert.equal(state.next.id,'BASE');assert.equal(state.evolution.status,'NOT_CHECKED');
 const next=await s.ensureNextJob();assert.equal(next.job.optional_context.roadmap_id,'BASE');
});
test('supervisor creates only approved evolution jobs when baseline is complete',async()=>{
 const r=repo();
 const s=new AutonomySupervisor({repository:r,roadmap:[{...initial[0],status:'DONE_VERIFIED'}],evolutionLoader:async()=>backlog});
 const first=await s.ensureNextJob();
 assert.equal(first.created,true);
 assert.equal(first.job.optional_context.roadmap_id,'EVOLUTION-NEW-3');
 assert.equal(first.job.requested_by,'mel-autonomy');
 const again=await s.ensureNextJob();
 assert.equal(again.created,false);
 assert.equal(again.job.id,first.job.id);
 assert.equal((await r.list()).length,1);
});
test('unavailable queue reports a blocker rather than false completion',async()=>{
 const s=new AutonomySupervisor({repository:repo(),roadmap:[],evolutionLoader:async()=>{throw new Error('D1_DOWN')}});
 const state=await s.state();
 assert.equal(state.evolution.status,'UNAVAILABLE');
 assert.equal(state.evolution.actionable_count,null);
 const ensured=await s.ensureNextJob();
 assert.equal(ensured.created,false);
 assert.equal(ensured.complete,false);
});
test('proposed-only backlog never starts an autonomous development',async()=>{
 const s=new AutonomySupervisor({repository:repo(),roadmap:[],evolutionLoader:async()=>[backlog[0]]});
 const state=await s.state();
 assert.equal(state.evolution.status,'CONNECTED');
 assert.equal(state.evolution.actionable_count,0);
 const result=await s.ensureNextJob();
 assert.equal(result.created,false);
 assert.equal(result.complete,true);
});
