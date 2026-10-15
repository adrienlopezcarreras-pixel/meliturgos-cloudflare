import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {chooseReadyCompanionDevice as pick} from '../../src/portability/companion-sovereignty-executor.js';
const now=1700000000000;
function row(id,{lastSeen=now-1000,engineSeen=now-1000,
 consent=true,busy=false,stale=false,version='1.4.1',halted=0}={}){
 return {
  id,platform:'windows',halted,last_seen_at:lastSeen,
  metadata:JSON.stringify({
   engine_heartbeat_at:engineSeen,engine_version:version,
   local_compute_enabled:consent,local_compute_profile:'light',
   local_compute_telemetry:{observed_at:stale?now-15000:now-2000,
    cpu_percent:busy?95:12,free_ram_mb:8192,on_battery:false,
    user_busy:false,gpu_available:false,active_jobs:0}
  })
 };
}
test('local inference uses older *admitted* owner PC instead of busy recent PC',()=>{
 const rows=[row('recent-no-permission',{consent:false,lastSeen:now-500}),
  row('active-but-busy',{busy:true,lastSeen:now-750}),
  row('authorized-owner-pc',{lastSeen:now-2000})];
 assert.equal(pick(rows,{now,requireReadyLocalAi:true})?.id,'authorized-owner-pc');
 assert.equal(pick(rows,{now,requireReadyLocalAi:false})?.id,'recent-no-permission');
});
test('never selects old, halted, downgraded or stale machines for local inference',()=>{
 const rows=[
  row('halted',{halted:1}),
  row('old-engine',{engineSeen:now-40000}),
  row('old-native',{lastSeen:now-40000}),
  row('bad-version',{version:'0.2.0'}),
  row('stale-telemetry',{stale:true}),
  row('no-opt-in',{consent:false})
 ];
 assert.equal(pick(rows,{now,requireReadyLocalAi:true}),null);
});
test('device selection preserves the caller-selected pinned device path',async()=>{
 const src=await readFile(new URL('../../src/portability/companion-sovereignty-executor.js',import.meta.url),'utf8');
 const from=src.indexOf('async function chooseDevice('),until=src.indexOf('function parseJson(',from);
 const section=src.slice(from,until);
 assert.match(section,/if\(deviceId\)\{/);
 assert.match(section,/SELECT \* FROM computer_devices WHERE id=\? LIMIT 1/);
 assert.match(section,/return engineHeartbeatFresh\(row,\{now,onlineWithinMs\}\)\?row:null/);
 assert.match(src,/requireReadyLocalAi:needsReadyLocalAi/);
});
