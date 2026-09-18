import test from 'node:test';
import assert from 'node:assert/strict';
import { RAGService } from '../src/search/rag-service.js';

function memoryDb(){
  return {
    prepare(sql){
      return {
        bind(){
          return {
            async all(){
              if(sql.includes("'memories' source")) return {results:[
                {id:1,content:'texte contrôlé avec provenance',timestamp:10,provenance:'explicit-user',source:'memories'}
              ]};
              return {results:[]};
            }
          };
        }
      };
    }
  };
}

test('canonical knowledge retrieval is bounded and preserves provenance', async () => {
  const result=await RAGService.search(memoryDb(),'adrien','texte contrôlé',{sources:['memories'],limit:5});
  assert.equal(result.retrieval,'lexical');
  assert.equal(result.results.length,1);
  assert.equal(result.results[0].provenance.table,'memories');
  assert.equal(result.results[0].provenance.id,1);
});

test('knowledge retrieval rejects unknown sources and unauthenticated owners', async () => {
  await assert.rejects(()=>RAGService.search(memoryDb(),'adrien','test',{sources:['internet']}),/INVALID_SOURCES/);
  await assert.rejects(()=>RAGService.search(memoryDb(),'','test',{sources:['memories']}),/AUTH_REQUIRED/);
});
