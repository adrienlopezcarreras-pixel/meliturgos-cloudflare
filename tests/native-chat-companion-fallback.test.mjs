import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {tryOptionalNativeCompanionFallback as fallback} from '../src/api/native-companion-fallback.js';

test('native-chat invokes owner Companion only after ordinary cloud fallbacks',async()=>{
 const s=await readFile(new URL('../src/api/native-chat.js',import.meta.url),'utf8');
 const cloud=s.indexOf('for (const attempt of attempts)',s.indexOf('const fallbackModels ='));
 const local=s.indexOf('recovered = await tryOptionalNativeCompanionFallback({',cloud);
 assert.ok(cloud>0&&local>cloud);
 assert.match(s,/!privateConnectedDataRequest\(activeTaskText\)/);
 assert.match(s,/body.use_companion_compute !== false/);
 assert.match(s,/toolResults.length === 0/);
});
test('real executor result becomes a usable native-chat response',async()=>{
 const calls=[];
 const answer=await fallback({
   env:{},messages:[{role:'user',content:'Bonjour'}],
   inferenceSettings:{max_tokens:90},
   execute:async input=>{
     calls.push(input);
     return {ok:true,text:'Salut, je suis MEL sur ton PC',model:'qwen2.5:1.5b',
       backend:'ollama-localhost',inference_metrics:{output_tokens:12,eval_duration_ns:1e9,
       tokens_per_second:12,gpu_vram_bytes:0,gpu_evidence:'UNVERIFIED'}};
   }
 });
 assert.equal(calls.length,1);
 assert.equal(calls[0].action,'invoke');
 assert.equal(calls[0].payload.max_tokens,90);
 assert.equal(answer.text,'Salut, je suis MEL sur ton PC');
 assert.equal(answer.optional_companion_used,true);
 assert.equal(answer.provenance.performance.tokens_per_second,12);
});
test('offline, failure, or oversize payload produce quiet primary MEL fallback',async()=>{
 const messages=[{role:'user',content:'Bonjour'}];
 assert.equal(await fallback({env:{},messages}),null);
 assert.equal(await fallback({env:{},messages,execute:async()=>({ok:false,code:'LOCAL_COMPUTE_DISABLED'})}),null);
 assert.equal(await fallback({env:{},messages,execute:async()=>{throw Error('offline')}}),null);
 assert.equal(await fallback({env:{},messages:[{role:'user',content:'x'.repeat(25000)}],execute:async()=>{throw Error('MUST_NOT_CALL')}}),null);
});

test('owner may explicitly prefer a quick optional local-first answer without changing defaults',async()=>{
 const {shouldPreferOptionalCompanionCompute:prefer}=await import('../src/api/native-companion-fallback.js');
 assert.equal(prefer({}),false);
 assert.equal(prefer({prefer:true}),true);
 for(const constraint of [
  {disabled:true},{voiceReply:true},{personalProfileIntent:true},{releaseSmoke:true},
  {privateData:true},{hasToolResults:true},{parallel:true},{hasActiveAdapter:true}
 ]) assert.equal(prefer({prefer:true,...constraint}),false,JSON.stringify(constraint));
});
test('explicit local-first response is not misrepresented as a fallback',async()=>{
 const {shouldPreferOptionalCompanionCompute:prefer}=await import('../src/api/native-companion-fallback.js');
 const native=await readFile(new URL('../src/api/native-chat.js',import.meta.url),'utf8');
 assert.equal(prefer({prefer:true}),true);
 const local=native.indexOf('ai = preferLocal ? await tryOptionalNativeCompanionFallback({');
 const primary=native.indexOf('if(!ai) ai = await runNativeInference({',local);
 assert.ok(local>0&&primary>local);
 assert.match(native.slice(local,primary),/asPrimary:true,timeoutMs:4000/);
 const result=await fallback({
   env:{},messages:[{role:'user',content:'bonjour'}],
   timeoutMs:4000,asPrimary:true,
   execute:async()=>({ok:true,text:'Réponse depuis le PC',backend:'ollama-localhost',model:'local-qwen'})
 });
 assert.equal(result.text,'Réponse depuis le PC');
 assert.equal(result.companion_primary,true);
 assert.equal(result.fallback_used,false);
});
test('local-first failures yield null and leave normal remote inference available',async()=>{
 const result=await fallback({env:{},messages:[{role:'user',content:'hi'}],
   asPrimary:true,timeoutMs:4000,execute:async()=>({ok:false,code:'COMPUTER_OFFLINE'})});
 assert.equal(result,null);
});
