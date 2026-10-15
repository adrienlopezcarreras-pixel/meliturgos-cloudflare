import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const src=await readFile(new URL('../../assets/MEL-Computer-Companion.ps1',import.meta.url),'utf8');
const dist=await readFile(new URL('../../dist/MEL-Computer-Companion.ps1',import.meta.url),'utf8');
const win=await readFile(new URL('../../windows-companion/MEL-Companion.cs',import.meta.url),'utf8');
const api=await readFile(new URL('../../src/devices/computer-companion-api.js',import.meta.url),'utf8');
test('GPU consent is independent and defaults disabled in atomic Windows config',()=>{
 assert.equal(src,dist);
 assert.match(win,/d\["local_compute_gpu_enabled"\] = false;/);
 assert.match(win,/next\["local_compute_gpu_enabled"\] = localComputeEnabled && localComputeProfile != "off" && localGpuEnabled;/);
 assert.match(win,/Checked=MelApp.ConfigBool\("local_compute_gpu_enabled"\)/);
 assert.match(win,/gpuCompute!=null&&gpuCompute.Checked/);
});
test('Ollama explicit num_gpu=0 without consent and small profile layer limits',()=>{
 assert.match(src,/function Get-LocalGpuConsent/);
 assert.match(src,/\$saved.local_compute_gpu_enabled -eq \$true/);
 assert.match(src,/\$gpuLayers = if \(-not \$gpuConsent\) \{ 0 \}/);
 assert.match(src,/num_gpu=\$gpuLayers/);
 assert.match(src,/LOCAL_GPU_CONSENT_CHANGED/);
 assert.match(src,/"light" \{ 1 \} "balanced" \{ 2 \} default \{ 4 \}/);
});
test('authenticated dual-heartbeats and server preserve GPU opt-in separately',()=>{
 assert.match(win,/\{"local_compute_gpu_enabled",ConfigBool\("local_compute_enabled"\)&&ConfigBool\("local_compute_gpu_enabled"\)\}/);
 assert.match(src,/local_compute_gpu_enabled = \(\$localComputeEnabled -and \$localGpuEnabled\)/);
 assert.match(api,/patch.local_compute_gpu_enabled=patch.local_compute_enabled&&b.local_compute_gpu_enabled===true;/);
});
