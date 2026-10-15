import test from 'node:test';
import assert from 'node:assert/strict';
import {ConversationService} from '../src/conversations/conversation-service.js';

function fixture(){
 const archive=[
  {id:'a',conversation_id:'c',role:'user',content:'bonjour',timestamp:100},
  {id:'b',conversation_id:'c',role:'mel',content:'réponse',timestamp:100},
  {id:'c',conversation_id:'c',role:'mel',content:'réponse',timestamp:100},
  {id:'d',conversation_id:'c',role:'user',content:'suite',timestamp:101},
  {id:'foreign',conversation_id:'other',role:'user',content:'private',timestamp:200},
 ];
 const checkpoints=new Map();
 const queries=[];
 const db={
  prepare(sql){
   const query=sql.replace(/\s+/g,' ').trim();
   queries.push(query);
   let params=[];
   return {
    bind(...values){params=values;return this;},
    async first(){
     assert.match(query,/SELECT last_message_timestamp, last_message_id FROM sync_checkpoints/);
     return checkpoints.get(params[0]+'|'+params[1])||null;
    },
    async all(){
     assert.match(query,/timestamp > \? OR \(timestamp = \? AND id > \?\)/);
     assert.match(query,/ORDER BY timestamp ASC, id ASC/);
     const [conversation,since,sameTs,id]=params;
     assert.equal(since,sameTs);
     return {results:archive.filter(m=>m.conversation_id===conversation&&
      (m.timestamp>since||(m.timestamp===sameTs&&m.id>id)))
      .sort((a,b)=>a.timestamp-b.timestamp||a.id.localeCompare(b.id))};
    },
    async run(){
     assert.match(query,/ON CONFLICT\(device_id, conversation_id\) DO UPDATE/);
     assert.match(query,/excluded.last_message_timestamp > sync_checkpoints.last_message_timestamp/);
     assert.match(query,/excluded.last_message_id > sync_checkpoints.last_message_id/);
     const [device,conversation,id,time]=params;
     const key=device+'|'+conversation;
     const prev=checkpoints.get(key);
     if(!prev||time>prev.last_message_timestamp||
       (time===prev.last_message_timestamp&&id>prev.last_message_id)){
      checkpoints.set(key,{last_message_timestamp:time,last_message_id:id});
     }
     return {meta:{changes:1}};
    }
   };
  }
 };
 const service=new ConversationService(db);
 service.migrate=async()=>service;
 return {service,queries,checkpoints};
}

test('equal-millisecond messages after an ACK are not silently lost',async()=>{
 const {service}=fixture();
 await service.updateSyncCheckpoint('phone','c','b',100);
 const page=await service.getSyncMessages('phone','c');
 assert.deepEqual(page.messages.map(m=>m.id),['c','d']);
 assert.equal(page.since,100);
 await service.updateSyncCheckpoint('phone','c','c',100);
 assert.deepEqual((await service.getSyncMessages('phone','c')).messages.map(m=>m.id),['d']);
});

test('stale ACK cannot regress a device checkpoint, including same-millisecond IDs',async()=>{
 const {service,checkpoints}=fixture();
 await service.updateSyncCheckpoint('phone','c','d',101);
 await service.updateSyncCheckpoint('phone','c','a',100);
 await service.updateSyncCheckpoint('phone','c','c',100);
 assert.deepEqual(checkpoints.get('phone|c'),{last_message_id:'d',last_message_timestamp:101});
 await service.updateSyncCheckpoint('phone','c','c',101);
 assert.deepEqual(checkpoints.get('phone|c'),{last_message_id:'d',last_message_timestamp:101});
 assert.equal((await service.getSyncMessages('phone','c')).messages.length,0);
});

test('initial sync is ordered and scoped to the requested conversation',async()=>{
 const {service}=fixture();
 const result=await service.getSyncMessages('tablet','c');
 assert.deepEqual(result.messages.map(m=>m.id),['a','b','c','d']);
 assert.equal(result.messages.some(m=>m.id==='foreign'),false);
});
