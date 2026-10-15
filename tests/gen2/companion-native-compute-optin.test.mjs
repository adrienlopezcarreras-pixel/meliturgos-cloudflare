import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const native=await readFile(new URL('../../windows-companion/MEL-Companion.cs',import.meta.url),'utf8');
const engine=await readFile(new URL('../../assets/MEL-Computer-Companion.ps1',import.meta.url),'utf8');
test('Windows compute consent defaults off and is separate from remote control',()=>{
 assert.match(native,/d\["local_compute_enabled"\] = false;/);
 assert.match(native,/d\["remote_access_enabled"\] = false;/);
 assert.match(native,/next\["local_compute_enabled"\] = localComputeEnabled && localComputeProfile != "off";/);
 assert.match(native,/next\["remote_access_enabled"\] = remoteAccessEnabled;/);
 assert.match(native,/SavePermissions\(apps,allowedPaths,[\s\S]*localCompute!=null&&localCompute.Checked,profile,[\s\S]*gpuCompute!=null&&gpuCompute.Checked\);/);
});
test('both authenticated heartbeat senders forward local owner opt-in',()=>{
 assert.match(native,/\{"local_compute_enabled",ConfigBool\("local_compute_enabled"\)\}/);
 assert.match(engine,/local_compute_enabled = \$localComputeEnabled/);
 assert.match(engine,/Get-Content -Raw -Encoding UTF8 -LiteralPath \$ConfigPath \| ConvertFrom-Json/);
 assert.match(engine,/\$allowedProfiles -contains \[string\]\$localConfig.local_compute_profile/);
});
