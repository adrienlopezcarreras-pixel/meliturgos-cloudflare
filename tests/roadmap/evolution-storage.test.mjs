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
