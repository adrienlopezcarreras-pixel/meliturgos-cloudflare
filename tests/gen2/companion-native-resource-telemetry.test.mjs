import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {evaluateMeasuredOptionalCompute} from '../../src/devices/companion-compute-admission.js';
const desktop=await readFile(new URL('../../windows-companion/MEL-Companion.cs',import.meta.url),'utf8');
const api=await readFile(new URL('../../src/devices/computer-companion-api.js',import.meta.url),'utf8');
test('native Windows telemetry samples real CPU and free RAM without claiming GPU proof',()=>{
 assert.match(desktop,/GetSystemTimes\(out idle, out kernel, out user\)/);
 assert.match(desktop,/GlobalMemoryStatusEx\(ref memory\)/);
 assert.match(desktop,/GetLastInputInfo\(ref activity\)/);
 assert.match(desktop,/if \(!sampled\) return null/);
 assert.match(desktop,/\{"gpu_available",false\}/);
 assert.match(desktop,/if \(ConfigBool\("local_compute_enabled"\)\)/);
 assert.match(desktop,/heartbeat\["local_compute_telemetry"\] = measurement/);
});
test('server validates and timestamps device telemetry, denies stale/invalid samples',()=>{
 assert.match(api,/patch.local_compute_telemetry=\{/);
 assert.match(api,/observed_at:now,cpu_percent:telemetry.cpu_percent/);
 assert.match(api,/patch.local_compute_telemetry=null/);
 assert.match(api,/evaluateMeasuredOptionalCompute\(\{/);
 const now=100000,telemetry={observed_at:now,cpu_percent:20,free_ram_mb:8192,
 on_battery:false,user_busy:false,gpu_available:false,active_jobs:0};
 assert.equal(evaluateMeasuredOptionalCompute({enabled:true,profile:'light',online:true,telemetry,now}).allowed,true);
 assert.equal(evaluateMeasuredOptionalCompute({enabled:true,profile:'light',online:true,telemetry,now:now+10001}).allowed,false);
});
