import test from 'node:test';
import assert from 'node:assert/strict';
import { CapabilityBus } from '../../src/capabilities/capability-bus.js';
import { registerEvolutionCapabilities } from '../../src/capabilities/evolution-capabilities.js';

function makeDB() {
 const entries=new Map();
 return {
  exec:async()=>{},
  prepare(sql) {
   return { async first(){return null;}, bind(...args) {
    const [scope,id] = args;
    return {
     all:async()=>({results:[...entries.values()].filter(r=>r.owner===scope).map(r=>({payload:r.payload,revision:1}))}),
     first:async()=>{
      const hit=[...entries.values()].find(r=>r.owner===scope&&(sql.includes('canonical_title')?r.key===id:r.id===id));
      return hit?{id:hit.id}:null;
     },
     run:async()=>{
      if(!sql.startsWith('INSERT'))throw new Error('UNEXPECTED_SQL');
      const [owner,entryId,key,payload]=args;
      entries.set(JSON.stringify([owner,entryId]),{owner,id:entryId,key,payload});
      return {success:true,meta:{changes:1}};
     }
    };
   }};
  }
 };
}
test('evolution capabilities require an authenticated owner and explicit write permission',async()=>{
 const bus=new CapabilityBus();
 registerEvolutionCapabilities(bus,{db:makeDB()});
 assert.equal(bus.contract('evolution.list').valid,true);
 assert.equal(bus.contract('evolution.propose').valid,true);
 await assert.rejects(bus.execute('evolution.list',{},{}),/AUTH_REQUIRED/);
 await assert.rejects(bus.execute('evolution.propose',{id:'ev-1',title:'Improve memory',origin:'mel'},{owner:'owner-A',permissions:[]}),/PERMISSION_DENIED/);
 const created=await bus.execute('evolution.propose',{id:'ev-1',title:'Improve memory',origin:'mel'},{owner:'owner-A',permissions:['roadmap.write']});
 assert.equal(created.created,true);
 const other=await bus.execute('evolution.list',{}, {owner:'owner-B',permissions:[]});
 assert.equal(other.evolution.total,0);
 const own=await bus.execute('evolution.list',{}, {owner:'owner-A',permissions:[]});
 assert.equal(own.evolution.total,1);
 assert.equal(own.initial_scope,'CURRENT_REGISTRY_NOT_ARCHIVED');
});
test('D1 unavailable is not advertised as healthy',()=>{
 const bus=new CapabilityBus();
 registerEvolutionCapabilities(bus,{db:null});
 assert.equal(bus.describe('evolution.list').health,'UNAVAILABLE');
});
