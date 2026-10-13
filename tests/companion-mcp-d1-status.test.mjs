import test from 'node:test';
import assert from 'node:assert/strict';
import {makeCompanionD1StatusReader} from '../src/devices/companion-mcp-d1-status.js';
test('reader needs database',()=>assert.throws(()=>makeCompanionD1StatusReader(),/MCP_STATUS_DB_REQUIRED/));
test('current heartbeat is online without leaking device metadata',async()=>{
 const now=1800000000000;
 const db={prepare:sql=>({bind:id=>({first:async()=>({id,halted:0,last_seen_at:now-2000,metadata:'PRIVATE'})})})};
 const result=await makeCompanionD1StatusReader(db,{now:()=>now})({},'win-1');
 assert.deepEqual(result,{id:'win-1',halted:false,online:true,last_seen_at:now-2000});
});
test('stale or future heartbeat not online',async()=>{
 const now=1800000000000;
 for(const seen of [now-40000,now+1000]){
  const db={prepare:()=>({bind:id=>({first:async()=>({id,halted:1,last_seen_at:seen})})})};
  const result=await makeCompanionD1StatusReader(db,{now:()=>now})({},'win-1');
  assert.equal(result.online,false);
  assert.equal(result.halted,true);
 }
});
test('missing device is denied',async()=>{
 const db={prepare:()=>({bind:()=>({first:async()=>null})})};
 await assert.rejects(makeCompanionD1StatusReader(db)({},'missing'),/MCP_STATUS_DEVICE_NOT_FOUND/);
});
