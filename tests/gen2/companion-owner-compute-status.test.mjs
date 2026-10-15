import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {getOwnerCompanionComputeReadiness as status} from '../../src/devices/companion-compute-admission.js';
const now=1700000000000;
const device={halted:false,last_seen_at:now-2000,metadata:{
 local_compute_enabled:true,local_compute_gpu_enabled:true,local_compute_profile:'light',
 engine_heartbeat_at:now-3000,
 local_compute_telemetry:{observed_at:now-2000,cpu_percent:18,free_ram_mb:8192,
 on_battery:false,user_busy:false,gpu_available:false,active_jobs:0}
}};
test('owner status reports admission separately from unproven GPU compute',()=>{
 const s=status(device,{now});
 assert.equal(s.allowed,true);assert.equal(s.reason,'ADMITTED');
 assert.equal(s.gpu_consent,true);assert.equal(s.gpu_compute_proven,false);
 assert.equal(s.profile,'light');assert.equal(s.telemetry_at,now-2000);
});
test('owner reasons stay fail closed for stale, busy and revoked PC',()=>{
 const scenarios=[
  [{...device,last_seen_at:now-40000},'COMPANION_UNAVAILABLE'],
  [{...device,metadata:{...device.metadata,local_compute_enabled:false}},'LOCAL_COMPUTE_DISABLED'],
  [{...device,metadata:{...device.metadata,local_compute_telemetry:{...device.metadata.local_compute_telemetry,observed_at:now-11000}}},'COMPUTE_TELEMETRY_STALE'],
  [{...device,metadata:{...device.metadata,local_compute_telemetry:{...device.metadata.local_compute_telemetry,user_busy:true}}},'PC_PRIORITY'],
  [{...device,halted:true},'COMPANION_UNAVAILABLE'],
  [{...device,metadata:{...device.metadata,engine_heartbeat_at:now-40000}},'COMPANION_UNAVAILABLE'],
 ];
 for(const [candidate,code] of scenarios)assert.equal(status(candidate,{now}).reason,code);
});
test('owner status route includes read-only admission reasons, no elevation',async()=>{
 const src=await readFile(new URL('../../src/devices/computer-companion-api.js',import.meta.url),'utf8');
 const start=src.indexOf('async function ownerStatus(');
 const end=src.indexOf('function approvals(',start);
 const segment=src.slice(start,end);
 assert.match(segment,/getOwnerCompanionComputeReadiness\(device,\{now:statusAt\}\)/);
 assert.match(segment,/authorizeOwnerOrPcProof\(request,env\)/);
 assert.doesNotMatch(segment,/UPDATE computer_devices|UPDATE computer_commands/);
});
