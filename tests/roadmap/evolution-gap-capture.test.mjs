import test from 'node:test';
import assert from 'node:assert/strict';
import { CapabilityBus } from '../../src/capabilities/capability-bus.js';
import { prepareGapProposal } from '../../src/roadmap/evolution-gap-capture.js';
import { registerEvolutionCapabilities } from '../../src/capabilities/evolution-capabilities.js';

function mockD1(){
 const rows=[];
 return {
  rows,
  prepare(sql){
   return {bind(...args){
    return {
     async first(){
      const [owner,value]=args;
      const found=rows.find(row=>row.owner===owner&&(sql.includes('canonical_title')?row.key===value:row.id===value));
      return found?{id:found.id}:null;
     },
     async run(){
      if(!sql.startsWith('INSERT'))throw new Error('UNEXPECTED_SQL');
      const [owner,id,key,payload]=args;
      rows.push({owner,id,key,payload});return {success:true,meta:{changes:1}};
     }
    };
   }};
  }
 };
}
test('detector refuses auto-capture when an existing capability matches',()=>{
 const r=prepareGapProposal({goal:'Chercher dans le code',capabilities:[{id:'code.search',name:'Chercher dans le code',health:'HEALTHY',enabled:true}]});
 assert.equal(r.proposable,false);
 assert.equal(r.assessment.classification,'MATCHED_AVAILABLE');
});
test('gap proposal is deterministic, explicitly PROPOSED and never approved',async()=>{
 const db=mockD1(),bus=new CapabilityBus();registerEvolutionCapabilities(bus,{db});
 const goal='Orchestration cryogénique spectrale intergalactique';
 const ctx={owner:'owner-A',permissions:['roadmap.write']};
 await assert.rejects(bus.execute('evolution.gap.capture',{goal},{owner:'owner-A',permissions:[]}),/PERMISSION_DENIED/);
 const first=await bus.execute('evolution.gap.capture',{goal},ctx);
 assert.equal(first.created,true);
 assert.equal(first.classification,'POSSIBLE_GAP');
 assert.equal(first.item.status,'PROPOSED');
 assert.equal(first.status,'PROPOSED_ONLY_NOT_APPROVED');
 const second=await bus.execute('evolution.gap.capture',{goal},ctx);
 assert.equal(second.created,false);
 assert.equal(second.duplicate_of,first.item.id);
 assert.equal(db.rows.length,1);
});
test('ambiguous and blocked matching capabilities never generate proposals',()=>{
 const ambiguous=prepareGapProposal({goal:'Hypermedia index',threshold:6,capabilities:[{id:'hypermedia.catalog',name:'Hypermedia',health:'UNKNOWN'}]});
 assert.equal(ambiguous.proposable,false);
 const blocked=prepareGapProposal({goal:'Hypermedia index',threshold:1,capabilities:[{id:'hypermedia.index',name:'Hypermedia index',health:'UNAVAILABLE'}]});
 assert.equal(blocked.proposable,false);
 assert.equal(blocked.assessment.classification,'MATCHED_BUT_BLOCKED');
});
test('malformed goal fails closed',()=>{
 assert.throws(()=>prepareGapProposal({goal:'a'}),/EVOLUTION_GAP_GOAL_INVALID/);
 assert.throws(()=>prepareGapProposal({goal:'#####'}),/EVOLUTION_GAP_ID_INVALID/);
});
