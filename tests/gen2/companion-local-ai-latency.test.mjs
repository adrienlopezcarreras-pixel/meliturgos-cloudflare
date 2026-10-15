import test from 'node:test';
import assert from 'node:assert/strict';
import {createCompanionLocalAiAdapter} from '../../src/portability/companion-local-ai-adapter.js';
test('successful Companion answer exposes measured round-trip latency, not a fake GPU boost',async()=>{
 const marks=[10000,10735];
 const adapter=createCompanionLocalAiAdapter({clock:()=>marks.shift(),execute:async()=>({
  ok:true,text:'réponse locale',model:'qwen2.5:1.5b',backend:'ollama-localhost',
  inference_metrics:{output_tokens:15,eval_duration_ns:1000000000,tokens_per_second:15,gpu_evidence:'UNVERIFIED',gpu_vram_bytes:0}
 })});
 const r=await adapter.invoke({input:'Bonjour'});
 assert.equal(r.provenance.performance.round_trip_latency_ms,735);
 assert.equal(r.provenance.performance.latency_scope,'companion-command-round-trip');
 assert.equal(r.provenance.performance.tokens_per_second,15);
 assert.equal(r.provenance.performance.gpu_evidence,'UNVERIFIED');
});
test('missing Ollama metrics still reports command elapsed time without GPU claims',async()=>{
 const adapter=createCompanionLocalAiAdapter({clock:(()=>{let i=0;return()=>i++?200:100})(),
 execute:async()=>({ok:true,text:'ok',model:'local'})});
 const result=await adapter.invoke({input:'hello'});
 assert.equal(result.provenance.performance.round_trip_latency_ms,100);
 assert.equal(result.provenance.performance.gpu_evidence,'UNVERIFIED');
});
test('clock jumps cannot produce negative or misleading latency',async()=>{
 const times=[1100,1000];
 const adapter=createCompanionLocalAiAdapter({clock:()=>times.shift(),
 execute:async()=>({ok:true,text:'ok'})});
 const r=await adapter.invoke({input:'hello'});
 assert.equal(r.provenance.performance.round_trip_latency_ms,null);
});
