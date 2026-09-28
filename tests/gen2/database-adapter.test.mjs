import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseAdapter, proveDatabaseAdapter } from '../../src/portability/database-adapter.js';

function memoryDb({corruptImport=false}={}){
  const committed=new Map();
  let txSeq=0;
  const txs=new Map();

  const snapshot=(tx)=>structuredClone(Object.fromEntries(txs.get(tx)?.entries()||[]));
  const ensure=(tx)=>{if(!txs.has(tx))txs.set(tx,new Map(committed));return txs.get(tx);};

  return new DatabaseAdapter({
    id:'db.alt',
    provider:'alternate-db',
    health:async()=>({ok:true}),
    begin:async()=>{const id='tx'+(++txSeq);txs.set(id,new Map(committed));return id;},
    commit:async tx=>{const map=ensure(tx);committed.clear();for(const [k,v] of map)committed.set(k,v);txs.delete(tx);return{ok:true};},
    rollback:async tx=>{txs.delete(tx);return{ok:true};},
    execute:async({tx,sql,params=[]})=>{
      const map=ensure(tx);
      if(/^CREATE TABLE/i.test(sql))return{ok:true};
      if(/^INSERT INTO/i.test(sql)){map.set(params[0],params[1]);return{ok:true};}
      return{ok:false};
    },
    query:async({tx,sql,params=[]})=>{
      const map=ensure(tx);
      if(/^SELECT/i.test(sql)){
        const value=map.get(params[0]);
        return{ok:true,rows:value===undefined?[]:[{id:params[0],value}]};
      }
      return{ok:false,rows:[]};
    },
    exportLogical:async({tx})=>({ok:true,snapshot:snapshot(tx)}),
    importLogical:async({tx,snapshot:incoming})=>{
      const map=ensure(tx);map.clear();
      for(const [k,v] of Object.entries(incoming||{}))map.set(k,corruptImport?'corrupted':v);
      return{ok:true};
    },
  });
}

test('provider-neutral database proof covers transaction CRUD export import rollback and commit',async()=>{
  const proof=await proveDatabaseAdapter(memoryDb());
  assert.equal(proof.ok,true);
  assert.equal(proof.status,'DATABASE_ADAPTER_VERIFIED');
  assert.equal(proof.export,true);
  assert.equal(proof.import,true);
  assert.equal(proof.rollback,true);
});

test('database proof rejects a corrupt logical import',async()=>{
  const proof=await proveDatabaseAdapter(memoryDb({corruptImport:true}));
  assert.equal(proof.ok,false);
  assert.equal(proof.status,'DATABASE_IMPORT_VERIFY_FAILED');
});
