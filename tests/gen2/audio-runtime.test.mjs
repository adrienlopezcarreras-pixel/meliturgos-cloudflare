import test from 'node:test';
import assert from 'node:assert/strict';

import {
  AUDIO_RUNTIME_SCHEMA,
  createAudio,
  createAudioAdapters,
  createAudioRuntime,
} from '../../src/media/audio.js';

const freeProvider = {
  capability: {
    id: 'free-audio',
    paid: false,
    priority: 10,
    actions: ['TRANSCRIBE','SYNTHESIZE','ANALYZE','GENERATE'],
  },
  async transcribe(){ return { text:'bonjour MEL', language:'fr' }; },
  async synthesize(input){ return { outputs:[{ id:'tts-1', url:'https://example.test/tts.mp3', mime:'audio/mpeg', metadata:{ voice:input.voice||'default' } }] }; },
  async analyze(){ return { analysis:{ kind:'speech', confidence:0.9 } }; },
  async generate(input){ return { outputs:[{ id:'gen-1', url:'https://example.test/music.mp3', mime:'audio/mpeg', metadata:{ mode:input.mode } }] }; },
};

test('audio facade remains fail-closed without adapters', async () => {
  const audio=createAudio();
  await assert.rejects(()=>audio.generate({prompt:'music'}),/NOT_IMPLEMENTED:media\/audio.generate/);
});

test('audio runtime prefers free provider and returns bounded provenance', async () => {
  const runtime=createAudioRuntime({
    providers:[freeProvider],
    now:()=> '2026-09-26T08:00:00.000Z',
  });

  const result=await runtime.generate({
    prompt:'calm orchestral intro',
    mode:'MUSIC',
    duration_seconds:8,
  });

  assert.equal(result.schema,AUDIO_RUNTIME_SCHEMA);
  assert.equal(result.provider,'free-audio');
  assert.equal(result.outputs[0].id,'gen-1');
  assert.equal(result.provenance.paid,false);
  assert.equal(result.provenance.estimated_cost_usd,0);
  assert.equal(result.provenance.request.mode,'MUSIC');
  assert.equal(typeof result.provenance.request.prompt_sha256,'string');
  assert.equal('prompt' in result.provenance.request,false);
});

test('audio runtime blocks paid provider without explicit approval and budget', async () => {
  let calls=0;
  const paidProvider={
    capability:{id:'paid-audio',paid:true,priority:1,actions:['GENERATE']},
    estimateCostUsd:async()=>0.02,
    generate:async()=>{calls+=1; return {outputs:[{id:'paid-1'}]};},
  };
  const runtime=createAudioRuntime({providers:[paidProvider]});

  await assert.rejects(
    ()=>runtime.generate({prompt:'music',mode:'MUSIC'},{maxCostUsd:1}),
    /AUDIO_NO_PROVIDER:GENERATE:paid-audio:paid_call_not_approved/,
  );
  assert.equal(calls,0);

  const result=await runtime.generate(
    {prompt:'music',mode:'MUSIC',approvedPaidCall:true},
    {maxCostUsd:0.05},
  );
  assert.equal(result.provider,'paid-audio');
  assert.equal(calls,1);
});

test('audio runtime keeps raw bytes out of public provenance', async () => {
  const runtime=createAudioRuntime({providers:[freeProvider]});
  const bytes=new Uint8Array([1,2,3,4,5]);
  const result=await runtime.analyze({bytes,mime:'audio/wav'});

  assert.equal(result.analysis.kind,'speech');
  assert.equal(typeof result.provenance.request.source_sha256,'string');
  assert.equal('bytes' in result.provenance.request,false);
});

test('audio transcription and synthesis adapters are available through canonical port', async () => {
  const audio=createAudio(createAudioAdapters({providers:[freeProvider]}));
  const transcript=await audio.transcribe({bytes:new Uint8Array([9,8,7]),mime:'audio/webm'});
  assert.equal(transcript.text,'bonjour MEL');

  const speech=await audio.synthesize({text:'Bonjour Adrien',voice:'fr-FR'});
  assert.equal(speech.outputs[0].id,'tts-1');
});

test('audio runtime validates bounded generation inputs', async () => {
  const runtime=createAudioRuntime({providers:[freeProvider]});
  await assert.rejects(()=>runtime.generate({prompt:'',mode:'MUSIC'}),/AUDIO_PROMPT_INVALID/);
  await assert.rejects(()=>runtime.generate({prompt:'ok',mode:'VIDEO'}),/AUDIO_MODE_INVALID/);
  await assert.rejects(
    ()=>runtime.transcribe({bytes:new Uint8Array(30_000_001)}),
    /AUDIO_BYTES_TOO_LARGE/,
  );
});
