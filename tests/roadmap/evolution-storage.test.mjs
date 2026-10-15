import test from 'node:test';
import assert from 'node:assert/strict';
import { initializeEvolutionStorage, listEvolutionItems, saveEvolutionProposal, changeEvolutionStatus, getEvolutionDashboard } from '../../src/roadmap/evolution-storage.js';

function fakeD1() {
 const rows=new Map();
 const key=(owner,id)=>JSON.stringify([owner,id]);
 let schemaApplied=false;
 const db={
  async exec(sql){ if(sql.includes('mel_evolution_items')) { assert.ok(sql.includes('PRIMARY KEY (owner_scope, id)')); schemaApplied=true; } },
  prepare(sql){
   const query={
    bind(...args){
     return {
      async first(){
       if(!schemaApplied)throw new Error('D1_TABLE_MISSING');
       if(sql.includes('canonical_title')) {
        const record=[...rows.values()].find(x=>x.owner===args[0]&&x.canonical===args[1]);
        return record?{id:record.id}:null;
       }
       const record=rows.get(key(args[0],args[1]));
       return record?{id:record.id,payload:record.payload,revision:record.revision}:null;
      },
      async run(){
       if(!schemaApplied)throw new Error('D1_TABLE_MISSING');
       if(sql.startsWith('INSERT')) {
        const [owner,id,canonical,payload]=args;
        if(rows.has(key(owner,id)))throw new Error('UNIQUE_CONSTRAINT');
        rows.set(key(owner,id),{owner,id,canonical,payload,revision:1});
        return {success:true,meta:{changes:1}};
       }
       if(sql.startsWith('UPDATE')) {
        const [payload,owner,id,revision]=args;
        const record=rows.get(key(owner,id));
        if(!record||record.revision!==revision)return {success:true,meta:{changes:0}};
        record.payload=payload;record.revision++;
        return {success:true,meta:{changes:1}};
       }
       throw new Error('UNEXPECTED_SQL');
      }
     };
    },
    async all(){
     if(!schemaApplied)throw new Error('D1_TABLE_MISSING');
     throw new Error('UNBOUND_LIST');
    }
   };
   if(sql.startsWith('SELECT payload FROM')) {
    query.bind=(owner)=>({
     all:async()=>{
      if(!schemaApplied)throw new Error('D1_TABLE_MISSING');
      return {results:[...rows.values()].filter(x=>x.owner===owner).map(x=>({payload:x.payload}))};
     }
    });
   }
   return query;
  }
 };
 return db;
}
const proposal=(id,title)=>({id,title,origin:'mel'});
test('missing D1 and owner fail closed rather than returning an empty success',async()=>{
 await assert.rejects(initializeEvolutionStorage(null),/EVOLUTION_D1_REQUIRED/);
 await assert.rejects(listEvolutionItems(null,'owner'),/EVOLUTION_D1_REQUIRED/);
 const db=fakeD1();
 await assert.rejects(listEvolutionItems(db,''),/EVOLUTION_OWNER_REQUIRED/);
 await assert.rejects(saveEvolutionProposal(db,'',proposal('A','One')),/EVOLUTION_OWNER_REQUIRED/);
 await assert.rejects(listEvolutionItems(db,'owner'),/D1_TABLE_MISSING/);
});
test('owner isolation, de-duplication and archived-status truth',async()=>{
 const db=fakeD1();await initializeEvolutionStorage(db);
 const a=await saveEvolutionProposal(db,'owner-A',proposal('E-1','Memory improvement'));
 assert.equal(a.created,true);
 const dup=await saveEvolutionProposal(db,'owner-A',proposal('E-2','memory improvement!'));
 assert.deepEqual(dup,{created:false,duplicate_of:'E-1'});
 await assert.rejects(saveEvolutionProposal(db,'owner-A',proposal('E-1','Different item')),/EVOLUTION_DUPLICATE_ID/);
 const b=await saveEvolutionProposal(db,'owner-B',proposal('E-1','Memory improvement'));
 assert.equal(b.created,true);
 assert.equal((await listEvolutionItems(db,'owner-A')).length,1);
 assert.equal((await listEvolutionItems(db,'owner-B')).length,1);
 const dash=await getEvolutionDashboard(db,'owner-A',{total:4,verified:4});
 assert.equal(dash.initial.percent_verified,100);
 assert.equal(dash.initial_scope,'CURRENT_REGISTRY_NOT_ARCHIVED');
 assert.equal(dash.evolution.total,1);
});
test('status writes enforce owner, valid transitions and compare-and-swap revision',async()=>{
 const db=fakeD1();await initializeEvolutionStorage(db);
 await saveEvolutionProposal(db,'owner-A',proposal('E-1','Module'));
 await assert.rejects(changeEvolutionStatus(db,'owner-B','E-1',1,'TRIAGED'),/EVOLUTION_ITEM_NOT_FOUND/);
 const next=await changeEvolutionStatus(db,'owner-A','E-1',1,'TRIAGED');
 assert.equal(next.revision,2);
 await assert.rejects(changeEvolutionStatus(db,'owner-A','E-1',1,'APPROVED'),/EVOLUTION_CONFLICT/);
 await assert.rejects(changeEvolutionStatus(db,'owner-A','E-1',2,'DONE_VERIFIED'),/EVOLUTION_INVALID_TRANSITION/);
});
