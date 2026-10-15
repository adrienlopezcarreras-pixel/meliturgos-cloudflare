import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createCompanionSovereigntyExecutor} from '../../src/portability/companion-sovereignty-executor.js';
const src=await readFile(new URL('../../assets/MEL-Computer-Companion.ps1',import.meta.url),'utf8');
const distributed=await readFile(new URL('../../dist/MEL-Computer-Companion.ps1',import.meta.url),'utf8');
test('both engine copies implement cooperative HTTP cancellation and never claim GPU stop proof',()=>{
 assert.equal(src,distributed);
 assert.match(src,/Add-Type -AssemblyName System.Net.Http/);
 assert.match(src,/function Invoke-OllamaWithCooperativeCancel/);
 assert.match(src,/\$client.PostAsync\(\$uri,\$content,\$cts.Token\)/);
 assert.match(src,/\$cts.Cancel\(\)/);
 assert.match(src,/Get-LocalComputeProfile/);
 assert.match(src,/Get-LocalGpuConsent/);
 assert.match(src,/SOVEREIGNTY_AI_LOCAL_CONSENT_REVOKED/);
 assert.match(src,/SOVEREIGNTY_AI_LOCAL_DEADLINE_EXPIRED/);
 assert.doesNotMatch(src,/Invoke-RestMethod -Uri \(\$state.endpoint \+ "\/api\/chat"\)/);
});
function store(){
 const at=Date.now();
 const device={id:'paired-pc',last_seen_at:at,halted:0,platform:'windows',
 metadata:JSON.stringify({engine_heartbeat_at:at,engine_version:'1.4.1',local_compute_enabled:true,
 local_compute_profile:'light',local_compute_telemetry:{observed_at:at,cpu_percent:5,free_ram_mb:12000,
 on_battery:false,user_busy:false,gpu_available:false,active_jobs:0}})};
 let plan;
 return {
  get plan(){return plan;},
  DB:{
   prepare(sql){return {
     async run(){return {meta:{changes:0}};},
     bind(...args){return {
       async all(){return {results:[device]};},
       async first(){if(sql.includes('FROM computer_commands'))return {status:'SUCCEEDED',
           result_json:JSON.stringify({outputs:[{text:'local answer'}]})};
         if(sql.includes('FROM computer_devices'))return device;
         return null;},
       async run(){if(sql.includes('INSERT INTO computer_commands'))plan=JSON.parse(args[3]);
         return {meta:{changes:1}};}
     };}
   };}
  }
 };
}
test('server stamps an unspoofable per-inference deadline into the queued plan',async()=>{
 const fake=store(),before=Date.now();
 const execute=createCompanionSovereigntyExecutor(fake,{timeoutMs:6000,pollIntervalMs:100});
 const result=await execute({capability:'sovereignty.ai',action:'invoke',
 payload:{messages:[{role:'user',content:'test'}],owner_inference_deadline_ms:9999999999999}});
 assert.equal(result.ok,true);
 const step=fake.plan.steps[0];
 assert.equal(step.action,'sovereignty.ai.invoke');
 assert.ok(step.payload.owner_inference_deadline_ms>=before+6000);
 assert.ok(step.payload.owner_inference_deadline_ms<=Date.now()+6000);
});
