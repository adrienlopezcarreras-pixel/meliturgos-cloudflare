import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createVideo,
  createVideoAdapters,
  createVideoRuntime,
} from '../../src/media/video.js';

const encoder=new TextEncoder();

function freeAnalyzer({id='free-video',priority=10,fail=false}={}){
  return {
    capability:{id,actions:['ANALYZE','PROCESS'],paid:false,enabled:true,priority,model:'video-free-v1'},
    async analyze(input){
      if(fail) throw new Error('VIDEO_ANALYZE_DOWN');
      return {model:'video-free-v1',analysis:{summary:'Two scenes with one speaker.',has_audio:true,input_has_bytes:input.bytes instanceof Uint8Array}};
    },
    async process(input){
      return {model:'video-free-v1',outputs:[{id:'processed-video',url:'https://cdn.example.test/processed.mp4',mime:'video/mp4',duration_seconds:8,metadata:{operation:input.operation}}]};
    },
  };
}

function freeGenerator({id='free-video-gen',priority=20,fail=false}={}){
  return {
    capability(){return {id,kinds:['VIDEO'],paid:false,enabled:true,priority,model:'video-gen-free-v1'};},
    async generate(input){
      if(fail) throw new Error('VIDEO_GENERATE_DOWN');
      return {model:'video-gen-free-v1',outputs:[{url:'https://cdn.example.test/generated.mp4',mime:'video/mp4',duration_seconds:input.duration_seconds||6}]};
    },
  };
}

function paidGenerator({id='paid-video-gen',cost=0.2}={}){
  return {
    capability(){return {id,kinds:['VIDEO'],paid:true,enabled:true,priority:1,model:'video-paid-v1'};},
    async estimateCostUsd(){return cost;},
    async generate(){return {model:'video-paid-v1',outputs:[{url:'https://paid.example.test/video.mp4'}]};},
  };
}

test('GEN2-23 analysis returns checksum-bound provenance without raw bytes',async()=>{
  const runtime=createVideoRuntime({providers:[freeAnalyzer()],now:()=> '2026-09-25T15:00:00.000Z'});
  const result=await runtime.analyze({bytes:encoder.encode('fake-video'),mime:'video/mp4'});
  assert.equal(result.schema,'mel.video-runtime/v1');
  assert.equal(result.provider,'free-video');
  assert.equal(result.analysis.summary,'Two scenes with one speaker.');
  assert.match(result.provenance.request.source_sha256,/^[0-9a-f]{64}$/);
  assert.equal(JSON.stringify(result.provenance).includes('fake-video'),false);
});

test('GEN2-23 free generation is preferred over paid generation',async()=>{
  let paidCalls=0;
  const paid=paidGenerator();
  const original=paid.generate;
  paid.generate=async input=>{paidCalls+=1;return original(input);};
  const runtime=createVideoRuntime({providers:[paid,freeGenerator({priority:99})]});
  const result=await runtime.generate({prompt:'A short cinematic landscape',duration_seconds:5});
  assert.equal(result.provider,'free-video-gen');
  assert.equal(paidCalls,0);
});

test('GEN2-23 paid generation requires authorization approval and budget',async()=>{
  const denied=createVideoRuntime({providers:[paidGenerator()]});
  await assert.rejects(
    ()=>denied.generate({prompt:'test',approvedPaidCall:true},{maxCostUsd:1}),
    e=>/not_authorized/.test(e?.code||e?.message||''),
  );

  const auth={async isAllowed(){return true;}};
  const noApproval=createVideoRuntime({providers:[paidGenerator()],authorization:auth});
  await assert.rejects(
    ()=>noApproval.generate({prompt:'test'},{maxCostUsd:1}),
    e=>/paid_call_not_approved/.test(e?.code||e?.message||''),
  );

  const tooExpensive=createVideoRuntime({providers:[paidGenerator({cost:0.5})],authorization:auth});
  await assert.rejects(
    ()=>tooExpensive.generate({prompt:'test',approvedPaidCall:true},{maxCostUsd:0.1}),
    e=>/cost_guard/.test(e?.code||e?.message||''),
  );
});

test('GEN2-23 talking-avatar mode carries image/audio references without exposing raw prompt',async()=>{
  let seen;
  const provider={
    capability(){return {id:'avatar-video',kinds:['VIDEO'],paid:false,enabled:true,model:'avatar-v1'};},
    async generate(input){
      seen=input;
      return {model:'avatar-v1',outputs:[{url:'https://cdn.example.test/avatar.mp4',duration_seconds:12}]};
    },
  };
  const runtime=createVideoRuntime({providers:[provider]});
  const result=await runtime.generate({
    mode:'TALKING_AVATAR',
    prompt:'Speak this sentence calmly.',
    image:'https://assets.example.test/portrait.png',
    audio:'https://assets.example.test/voice.wav',
    duration_seconds:12,
  });
  assert.equal(seen.mode,'TALKING_AVATAR');
  assert.deepEqual(seen.referenceImages,['https://assets.example.test/portrait.png']);
  assert.equal(seen.audio,'https://assets.example.test/voice.wav');
  assert.equal(result.provenance.request.mode,'TALKING_AVATAR');
  assert.equal(result.provenance.request.image_reference,true);
  assert.equal(result.provenance.request.audio_reference,true);
  assert.match(result.provenance.request.prompt_sha256,/^[0-9a-f]{64}$/);
  assert.equal('prompt' in result.provenance.request,false);
});

test('GEN2-23 provider failure falls through with evidence',async()=>{
  const runtime=createVideoRuntime({
    providers:[freeAnalyzer({id:'video-a',priority:1,fail:true}),freeAnalyzer({id:'video-b',priority:2})],
  });
  const result=await runtime.analyze({bytes:encoder.encode('fake-video'),mime:'video/mp4'});
  assert.equal(result.provider,'video-b');
  assert.deepEqual(result.attempts,[
    {provider:'video-a',status:'failed',reason:'VIDEO_ANALYZE_DOWN'},
    {provider:'video-b',status:'success'},
  ]);
});

test('GEN2-23 process sanitizes sensitive metadata',async()=>{
  const provider=freeAnalyzer();
  provider.process=async()=>({
    outputs:[{
      id:'processed',
      url:'https://cdn.example.test/processed.mp4',
      metadata:{operation:'trim',access_token:'must-not-leak'},
    }],
  });
  const runtime=createVideoRuntime({providers:[provider]});
  const result=await runtime.process({
    bytes:encoder.encode('fake-video'),
    mime:'video/mp4',
    operation:'trim',
    params:{start:1,end:4,password:'must-not-leak'},
  });
  assert.equal(result.outputs[0].metadata.operation,'trim');
  assert.equal(JSON.stringify(result).includes('must-not-leak'),false);
});

test('GEN2-23 existing VIDEO multimodal provider contract is supported',async()=>{
  const runtime=createVideoRuntime({providers:[freeGenerator()]});
  const result=await runtime.generate({prompt:'A bee flying over lavender'});
  assert.equal(result.provider,'free-video-gen');
  assert.equal(result.outputs[0].url,'https://cdn.example.test/generated.mp4');
});

test('GEN2-23 listProviders is free-first and action-aware',()=>{
  const runtime=createVideoRuntime({providers:[paidGenerator(),freeGenerator(),freeAnalyzer()]});
  assert.deepEqual(runtime.listProviders('GENERATE').map(x=>x.id),['free-video-gen','paid-video-gen']);
  assert.deepEqual(runtime.listProviders('ANALYZE').map(x=>x.id),['free-video']);
});

test('GEN2-23 stable video port remains fail-closed without adapters',async()=>{
  const port=createVideo();
  await assert.rejects(
    ()=>port.generate({prompt:'x'}),
    e=>e?.code==='NOT_IMPLEMENTED:media/video.generate',
  );
});

test('GEN2-23 createVideoAdapters exposes runtime behind stable port',async()=>{
  const port=createVideo(createVideoAdapters({providers:[freeAnalyzer(),freeGenerator()]}));
  const analysis=await port.analyze({bytes:encoder.encode('video'),mime:'video/mp4'});
  assert.equal(analysis.provider,'free-video');
  const generated=await port.generate({prompt:'Short clip'});
  assert.equal(generated.provider,'free-video-gen');
});
