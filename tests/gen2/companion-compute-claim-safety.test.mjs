import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {evaluateQueuedOptionalComputeClaim as check} from '../../src/devices/companion-compute-admission.js';
const now=1700000000000;
const telemetry={observed_at:now-2000,cpu_percent:18,free_ram_mb:8192,on_battery:false,user_busy:false,gpu_available:false,active_jobs:0};
const device={halted:0,metadata:{local_compute_enabled:true,local_compute_profile:'light',engine_heartbeat_at:now-5000,local_compute_telemetry:telemetry}};
const plan={schema:'mel.sovereignty.local-command/v1',steps:[{action:'sovereignty.ai.invoke',payload:{owner_inference_deadline_ms:now+12000}}]};
test('fresh approved AI claim is admitted; unrelated PC commands unaffected',()=>{
 assert.deepEqual(check({plan,device,now}),{ok:true,reason:'LOCAL_AI_ADMITTED'});
 assert.equal(check({plan:{schema:'other',steps:[{action:'file.read'}]},device:{halted:1},now}).ok,true);
});
test('stale or revoked AI work never reaches Windows execution',()=>{
 const verdicts=[
  check({plan:{...plan,steps:[{...plan.steps[0],payload:{owner_inference_deadline_ms:now-1}}]},device,now}),
  check({plan,device:{...device,metadata:{...device.metadata,local_compute_enabled:false}},now}),
  check({plan,device:{...device,metadata:{...device.metadata,local_compute_telemetry:{...telemetry,observed_at:now-10001}}},now}),
  check({plan,device:{...device,metadata:{...device.metadata,engine_heartbeat_at:now-36000}},now}),
  check({plan,device:{...device,halted:1},now}),
  check({plan:{...plan,steps:[...plan.steps,{action:'sovereignty.source_control.health'}]},device,now}),
  check({plan:{...plan,steps:[{...plan.steps[0],payload:{owner_inference_deadline_ms:now+121000}}]},device,now})
 ];
 for(const row of verdicts)assert.equal(row.ok,false,row.code);
 assert.deepEqual(verdicts.map(v=>v.code),[
  'LOCAL_AI_REQUEST_EXPIRED','LOCAL_AI_LOCAL_COMPUTE_DISABLED','LOCAL_AI_COMPUTE_TELEMETRY_STALE',
  'LOCAL_AI_ENGINE_OFFLINE','LOCAL_AI_OWNER_HALT','LOCAL_AI_PLAN_INVALID','LOCAL_AI_REQUEST_EXPIRED']);
});
test('claim endpoint revalidates before atomic PENDING to RUNNING update',async()=>{
 const s=await readFile(new URL('../../src/devices/computer-companion-api.js',import.meta.url),'utf8');
 const call=s.indexOf('const computeVerdict=evaluateQueuedOptionalComputeClaim(');
 const claim=s.indexOf('const update=await env.DB.prepare("UPDATE computer_commands SET status=?,claimed_at=?');
 assert.ok(call>0&&claim>call);
 assert.match(s.slice(call,claim),/blocked_command:\{id:r.id,code:computeVerdict.code\}/);
 assert.match(s.slice(call,claim),/status=\?/);
});
