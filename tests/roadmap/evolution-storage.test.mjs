import test from 'node:test';
import assert from 'node:assert/strict';
import {initializeEvolutionStorage,listEvolutionItems,saveEvolutionProposal,changeEvolutionStatus} from '../../src/roadmap/evolution-storage.js';
test('D1 must be explicit; no success for unavailable storage',async()=>{
 await assert.rejects(initializeEvolutionStorage(null),/EVOLUTION_D1_REQUIRED/);
 await assert.rejects(listEvolutionItems(null),/EVOLUTION_D1_REQUIRED/);
 await assert.rejects(saveEvolutionProposal(null,{id:'A',title:'One',origin:'mel'}),/EVOLUTION_D1_REQUIRED/);
});
test('storage surfaces failed and malformed reads',async()=>{
 const db={exec:async()=>{},prepare:()=>({all:async()=>({results:null})})};
 await assert.rejects(listEvolutionItems(db),/EVOLUTION_STORAGE_READ_FAILED/);
});

test('D1 proposal insert is persisted and duplicate title is detected',async()=>{
 const rows=new Map();
 const db={
  exec:async()=>{},
  prepare(sql){
   return {
    bind(...args){
     return {
      first:async()=>{
       if(sql.includes('canonical_title')) return [...rows.values()].find(x=>x.key===args[0])?.record ?? null;
       return null;
      },
      run:async()=>{
       if(sql.startsWith('INSERT')) {
        rows.set(args[0],{key:args[1],record:{id:args[0],payload:args[2],revision:1}});
        return {success:true,meta:{changes:1}};
       }
       throw new Error('UNEXPECTED_QUERY');
      }
     };
    },
    all:async()=>({results:[...rows.values()].map(x=>({payload:x.record.payload}))})
   };
  }
 };
 await initializeEvolutionStorage(db);
 const first=await saveEvolutionProposal(db,{id:'E-1',title:'Memory improvement',origin:'mel'});
 assert.equal(first.created,true);
 const duplicate=await saveEvolutionProposal(db,{id:'E-2',title:'memory improvement!',origin:'audit'});
 assert.deepEqual(duplicate,{created:false,duplicate_of:'E-1'});
 assert.equal((await listEvolutionItems(db)).length,1);
});
