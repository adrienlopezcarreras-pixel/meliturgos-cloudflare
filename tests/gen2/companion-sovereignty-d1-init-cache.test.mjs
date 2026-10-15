import test from 'node:test';
import assert from 'node:assert/strict';
import {ensureCompanionSovereigntyTables as initialize,createCompanionSovereigntyExecutor} from '../../src/portability/companion-sovereignty-executor.js';

function fakeDb({failOn=0}={}){
 const calls=[];
 const db={
  prepare(sql){
   calls.push(sql);
   return{
    async run(){
     if(failOn>0&&calls.length===failOn)throw Error('D1_SCHEMA_TEMPORARILY_UNAVAILABLE');
     await Promise.resolve();
     return{meta:{changes:0}};
    },
   };
  }
 };
 return{db,calls};
}
test('initialization only creates the two tables once per stable D1 binding',async()=>{
 const {db,calls}=fakeDb();
 await initialize(db);await initialize(db);
 assert.equal(calls.length,2);
 assert.match(calls[0],/CREATE TABLE IF NOT EXISTS computer_devices/);
 assert.match(calls[1],/CREATE TABLE IF NOT EXISTS computer_commands/);
});
test('parallel requests share one in-flight D1 table initialization',async()=>{
 const {db,calls}=fakeDb();
 await Promise.all(Array.from({length:15},()=>initialize(db)));
 assert.equal(calls.length,2);
});
test('schema failure is not cached and a later call retries both tables',async()=>{
 const {db,calls}=fakeDb({failOn:2});
 await assert.rejects(initialize(db),/D1_SCHEMA_TEMPORARILY_UNAVAILABLE/);
 await initialize(db);
 assert.equal(calls.length,4);
});
test('separate D1 bindings independently initialize their schemas',async()=>{
 const a=fakeDb(),b=fakeDb();
 await initialize(a.db);await initialize(b.db);
 assert.equal(a.calls.length,2);assert.equal(b.calls.length,2);
});
test('missing D1 binding is rejected rather than claiming it is initialized',async()=>{
 await assert.rejects(initialize(null),/COMPANION_SOVEREIGNTY_DB_REQUIRED/);
});
