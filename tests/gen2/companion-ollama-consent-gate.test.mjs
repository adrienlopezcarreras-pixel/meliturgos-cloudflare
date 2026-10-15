import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {evaluateMeasuredOptionalCompute} from '../../src/devices/companion-compute-admission.js';
const engine=await readFile(new URL('../../assets/MEL-Computer-Companion.ps1',import.meta.url),'utf8');
const distributed=await readFile(new URL('../../dist/MEL-Computer-Companion.ps1',import.meta.url),'utf8');
const queue=await readFile(new URL('../../src/portability/companion-sovereignty-executor.js',import.meta.url),'utf8');
test('both PowerShell copies require fresh local consent before model bootstrap',()=>{
 assert.equal(engine,distributed);
 const start=engine.indexOf('function Perform-SovereigntyAi(');
 const state=engine.indexOf('$state = Get-SovereigntyLocalAiState',start);
 const consent=engine.indexOf('$profile = Get-LocalComputeProfile',start);
 assert.ok(start>0&&consent>start&&state>consent);
 assert.match(engine,/\$saved.local_compute_enabled -ne \$true/);
 assert.match(engine,/\$profile = \(\[string\]\$saved.local_compute_profile\).Trim\(\)/);
 assert.match(engine,/if \(\(Get-LocalComputeProfile\) -ne \$profile\)/);
});
test('Ollama uses bounded thread count, context and idle keep-alive by profile',()=>{
 assert.match(engine,/num_thread=\$threads; num_ctx=\$contextTokens/);
 assert.match(engine,/\$threadFraction = switch \(\$profile\)/);
 assert.match(engine,/\$threads = \[Math\]::Max\(1,\[Math\]::Min\(8,/);
 assert.match(engine,/keep_alive=\$idleRetention/);
 assert.match(engine,/\$timeout = switch \(\$profile\)/);
});
test('sovereignty executor checks local consent and live PC resource admission',()=>{
 assert.match(queue,/if\(metadata.local_compute_enabled!==true\)/);
 assert.match(queue,/qualifiedAction==='sovereignty.ai.invoke'/);
 assert.match(queue,/evaluateMeasuredOptionalCompute\(\{/);
 const t={observed_at:10000,cpu_percent:35,free_ram_mb:10000,on_battery:false,user_busy:false,gpu_available:false,active_jobs:0};
 assert.equal(evaluateMeasuredOptionalCompute({enabled:true,profile:'light',online:true,telemetry:t,now:10001}).allowed,true);
 assert.equal(evaluateMeasuredOptionalCompute({enabled:true,profile:'light',online:true,telemetry:{...t,cpu_percent:90},now:10001}).allowed,false);
 assert.equal(evaluateMeasuredOptionalCompute({enabled:true,profile:'light',online:true,telemetry:t,now:25000}).allowed,false);
});
