import test from 'node:test';
import assert from 'node:assert/strict';
import { createCompanionObjectStorageAdapter } from '../../src/portability/companion-object-storage-adapter.js';
import { createCompanionDatabaseAdapter } from '../../src/portability/companion-database-adapter.js';
import { proveObjectStorageAdapter } from '../../src/portability/object-storage-adapter.js';
import { proveDatabaseAdapter } from '../../src/portability/database-adapter.js';

function storageExec(){
  const map=new Map();
  return async({action,payload})=>{
    if(action==='health')return{ok:true,backend:'local-files'};
    if(action==='put'){map.set(payload.key,payload.bytes_base64);return{ok:true,etag:'e1'};}
    if(action==='get')return map.has(payload.key)
      ?{ok:true,found:true,bytes_base64:map.get(payload.key)}
      :{ok:true,found:false};
    if(action==='list')return{ok:true,keys:[...map.keys()].filter(k=>k.startsWith(payload.prefix))};
    if(action==='delete'){map.delete(payload.key);return{ok:true};}
    return{ok:false,code:'UNKNOWN_ACTION'};
  };
}

function dbExec(){
  const committed=new Map();
  const txs=new Map();
  let seq=0;
  const ensure=tx=>{if(!txs.has(tx))txs.set(tx,new Map(committed));return txs.get(tx);};
  return async({action,payload})=>{
    if(action==='health')return{ok:true,engine:'sqlite'};
    if(action==='begin'){const tx='tx'+(++seq);txs.set(tx,new Map(committed));return{ok:true,tx};}
    if(action==='commit'){const m=ensure(payload.tx);committed.clear();for(const [k,v] of m)committed.set(k,v);txs.delete(payload.tx);return{ok:true};}
    if(action==='rollback'){txs.delete(payload.tx);return{ok:true};}
    if(action==='execute'){
      if(/^CREATE TABLE/i.test(payload.sql))return{ok:true,changes:0};
      if(/^INSERT INTO/i.test(payload.sql)){ensure(payload.tx).set(payload.params[0],payload.params[1]);return{ok:true,changes:1};}
      return{ok:false,code:'SQL_UNSUPPORTED'};
    }
    if(action==='query'){
      const value=ensure(payload.tx).get(payload.params[0]);
      return{ok:true,rows:value===undefined?[]:[{id:payload.params[0],value}]};
    }
    if(action==='export_logical'){
      return{ok:true,snapshot:Object.fromEntries(ensure(payload.tx))};
    }
    if(action==='import_logical'){
      const m=ensure(payload.tx);m.clear();for(const [k,v] of Object.entries(payload.snapshot||{}))m.set(k,v);return{ok:true};
    }
    return{ok:false,code:'UNKNOWN_ACTION'};
  };
}

test('companion storage satisfies provider-neutral object-store proof',async()=>{
  const proof=await proveObjectStorageAdapter(createCompanionObjectStorageAdapter({execute:storageExec()}));
  assert.equal(proof.ok,true);
  assert.equal(proof.provider,'local-companion-storage');
  assert.equal(proof.roundtrip,true);
});

test('companion database satisfies provider-neutral DB proof',async()=>{
  const proof=await proveDatabaseAdapter(createCompanionDatabaseAdapter({execute:dbExec()}));
  assert.equal(proof.ok,true);
  assert.equal(proof.provider,'local-companion-sqlite');
  assert.equal(proof.export,true);
  assert.equal(proof.import,true);
});

test('offline companion fails closed for storage and database',async()=>{
  const offline=async()=>({ok:false,code:'DEVICE_OFFLINE'});
  const storage=await createCompanionObjectStorageAdapter({execute:offline}).health();
  const database=await createCompanionDatabaseAdapter({execute:offline}).health();
  assert.equal(storage.ok,false);
  assert.equal(database.ok,false);
  assert.equal(storage.code,'DEVICE_OFFLINE');
  assert.equal(database.code,'DEVICE_OFFLINE');
});
