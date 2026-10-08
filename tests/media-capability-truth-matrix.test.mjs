import test from 'node:test';
import assert from 'node:assert/strict';

import { createDefaultCapabilityBus } from '../src/capabilities/default-bus.js';
import { creativeMediaCapabilityIds } from '../src/capabilities/creative-media-capabilities.js';

const context={ owner:'owner', permissions:[], requestId:'media-truth-audit' };

test('all twelve canonical media capabilities exist exactly once', () => {
  const bus=createDefaultCapabilityBus({ env:{} });
  const ids=creativeMediaCapabilityIds();
  assert.equal(ids.length,12);
  assert.equal(new Set(ids).size,12);
  const registered=bus.list().filter(row=>row.category==='creative-media').map(row=>row.id);
  assert.deepEqual(new Set(registered),new Set(ids));
});

test('zero-config media exposes only the built-in local DSP analyzers and keeps all external/storage-dependent paths unavailable', async () => {
  const bus=createDefaultCapabilityBus({ env:{} });
  const builtInHealthy=new Set(['media.audio.analyze','media.music.analyze']);
  for(const id of creativeMediaCapabilityIds()){
    const descriptor=bus.describe(id);
    assert.equal(descriptor.enabled,true,id);
    if(builtInHealthy.has(id)){
      assert.equal(descriptor.health,'HEALTHY',id);
      continue;
    }
    assert.equal(descriptor.health,'UNAVAILABLE',id);
    await assert.rejects(
      () => bus.execute(id, sampleInput(id), context),
      error => ['CAPABILITY_UNAVAILABLE','MEDIA_CAPABILITY_UNAVAILABLE'].includes(error?.code)
        || /UNAVAILABLE/.test(String(error?.code||error?.message||'')),
      id+' must fail closed when its real provider/storage proof is absent',
    );
  }
});

test('a real injected adapter makes only its exact capability healthy and executable', async () => {
  const calls=[];
  const bus=createDefaultCapabilityBus({
    env:{
      MEL_MEDIA_CAPABILITIES:{
        'media.video.analyze': async input => {
          calls.push(input);
          return { ok:true, provider:'fixture-real-adapter', frames:3 };
        },
      },
    },
  });

  assert.equal(bus.describe('media.video.analyze').health,'HEALTHY');
  assert.equal(bus.describe('media.video.process').health,'UNAVAILABLE');
  assert.equal(bus.describe('media.video.generate').health,'UNAVAILABLE');

  const result=await bus.execute('media.video.analyze',{ url:'https://example.com/video.mp4' },context);
  assert.equal(result.ok,true);
  assert.equal(result.provider,'fixture-real-adapter');
  assert.equal(calls.length,1);
});

test('media health is healthy only when a concrete executable adapter exists', async () => {
  const bus=createDefaultCapabilityBus({ env:{} });
  const rows=creativeMediaCapabilityIds().map(id=>bus.describe(id));
  assert.ok(rows.every(row=>row.enabled===true));
  const healthy=rows.filter(row=>row.health==='HEALTHY').map(row=>row.id).sort();
  assert.deepEqual(healthy,['media.audio.analyze','media.music.analyze']);
  const wav=pcmWavTone();
  const audio=await bus.execute('media.audio.analyze',{bytes:wav},context);
  const music=await bus.execute('media.music.analyze',{bytes:wav},context);
  assert.equal(audio.ok,true);
  assert.equal(music.ok,true);
  assert.equal(audio.provider,'mel-dsp');
  assert.equal(music.provider,'mel-dsp');
});

function sampleInput(id){
  if(id==='media.image.generate'||id==='media.audio.generate'||id==='media.music.generate'||id==='media.video.generate'){
    return { prompt:'bounded test' };
  }
  if(id==='media.audio.synthesize') return { text:'test' };
  if(id==='media.audio.transcribe') return { audio_base64:Buffer.from('audio').toString('base64') };
  if(id.startsWith('media.image.')) return { url:'https://example.com/image.jpg', operation:'resize' };
  if(id.startsWith('media.video.')) return { url:'https://example.com/video.mp4', operation:'trim' };
  return { url:'https://example.com/audio.mp3' };
}

function pcmWavTone({frequency=440,duration=0.25,sampleRate=8000}={}){
  const n=Math.max(64,Math.round(duration*sampleRate));
  const buffer=new ArrayBuffer(44+n*2);
  const view=new DataView(buffer);
  const write=(offset,text)=>{for(let i=0;i<text.length;i++)view.setUint8(offset+i,text.charCodeAt(i));};
  write(0,'RIFF'); view.setUint32(4,36+n*2,true); write(8,'WAVE');
  write(12,'fmt '); view.setUint32(16,16,true); view.setUint16(20,1,true); view.setUint16(22,1,true);
  view.setUint32(24,sampleRate,true); view.setUint32(28,sampleRate*2,true); view.setUint16(32,2,true); view.setUint16(34,16,true);
  write(36,'data'); view.setUint32(40,n*2,true);
  for(let i=0;i<n;i++) view.setInt16(44+i*2,Math.round(Math.sin(2*Math.PI*frequency*i/sampleRate)*0.45*32767),true);
  return new Uint8Array(buffer);
}
