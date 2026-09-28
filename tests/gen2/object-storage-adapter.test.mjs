import test from 'node:test';
import assert from 'node:assert/strict';
import { ObjectStorageAdapter, proveObjectStorageAdapter } from '../../src/portability/object-storage-adapter.js';

function memoryStore(){
  const map=new Map();
  return new ObjectStorageAdapter({
    id:'storage.alt',
    provider:'alternate-object-store',
    health:async()=>({ok:true}),
    put:async({key,bytes})=>{map.set(key,new Uint8Array(bytes));return{ok:true};},
    get:async({key})=>map.has(key)?{ok:true,found:true,bytes:map.get(key)}:{ok:true,found:false,status:'NOT_FOUND'},
    list:async({prefix})=>({ok:true,keys:[...map.keys()].filter(k=>k.startsWith(prefix))}),
    deleteObject:async({key})=>{map.delete(key);return{ok:true};},
  });
}

test('provider-neutral object storage proof covers write read list delete and integrity',async()=>{
  const proof=await proveObjectStorageAdapter(memoryStore());
  assert.equal(proof.ok,true);
  assert.equal(proof.status,'OBJECT_STORAGE_ADAPTER_VERIFIED');
  assert.equal(proof.roundtrip,true);
});

test('storage proof fails when roundtrip bytes change',async()=>{
  const a=memoryStore();
  a._get=async()=>({ok:true,found:true,bytes:new TextEncoder().encode('corrupted')});
  const proof=await proveObjectStorageAdapter(a);
  assert.equal(proof.ok,false);
  assert.equal(proof.status,'OBJECT_STORAGE_ROUNDTRIP_MISMATCH');
});
