import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {normalizeOllamaPerformanceEvidence as normalize,createCompanionLocalAiAdapter} from '../../src/portability/companion-local-ai-adapter.js';
const a=await readFile(new URL('../../assets/MEL-Computer-Companion.ps1',import.meta.url),'utf8');
const d=await readFile(new URL('../../dist/MEL-Computer-Companion.ps1',import.meta.url),'utf8');
test('Ollama reads actual generation metrics and VRAM residency (not a false GPU claim)',()=>{
 assert.equal(a,d);
 assert.match(a,/\$response.eval_count/);
 assert.match(a,/\$response.eval_duration/);
 assert.match(a,/\/api\/ps/);
 assert.match(a,/\[long\]\$modelRow.size_vram/);
 assert.match(a,/gpuEvidence = "UNVERIFIED"/);
 assert.match(a,/gpu_evidence=\$gpuEvidence/);
});
test('GPU evidence is fail-closed, invalid or missing stats never imply GPU',()=>{
 assert.equal(normalize({gpu_evidence:'OLLAMA_VRAM_RESIDENCY_REPORTED',gpu_vram_bytes:0}).gpu_evidence,'UNVERIFIED');
 assert.equal(normalize({gpu_evidence:'OLLAMA_VRAM_RESIDENCY_REPORTED',gpu_vram_bytes:-10}).gpu_evidence,'UNVERIFIED');
 assert.equal(normalize({gpu_evidence:'UNVERIFIED',gpu_vram_bytes:500}).gpu_vram_bytes,null);
 const p=normalize({output_tokens:110,eval_duration_ns:1200000000,tokens_per_second:91.67,
 gpu_evidence:'OLLAMA_VRAM_RESIDENCY_REPORTED',gpu_vram_bytes:2147483648});
 assert.equal(p.gpu_evidence,'OLLAMA_VRAM_RESIDENCY_REPORTED');
 assert.equal(p.tokens_per_second,91.67);
});
test('performance evidence travels to MEL provenance only when actually returned',async()=>{
 const adapter=createCompanionLocalAiAdapter({execute:async()=>({ok:true,text:'Answer',
 inference_metrics:{output_tokens:24,eval_duration_ns:1200000000,
 tokens_per_second:20,gpu_evidence:'UNVERIFIED',gpu_vram_bytes:0}})});
 const out=await adapter.invoke({input:'Hi'});
 assert.equal(out.text,'Answer');
 assert.equal(out.provenance.performance.tokens_per_second,20);
 assert.equal(out.provenance.performance.gpu_evidence,'UNVERIFIED');
});
