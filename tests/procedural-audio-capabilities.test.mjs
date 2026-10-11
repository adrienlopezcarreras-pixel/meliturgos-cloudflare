import test from 'node:test';
import assert from 'node:assert/strict';
import { createProceduralAudioCapabilities } from '../src/media/procedural-audio-capabilities.js';

function mediaKeyB64(){return Buffer.from(Uint8Array.from({length:32},(_,i)=>i+61)).toString('base64');}
function wavTone({frequency=440,duration=1,sampleRate=22050}={}){
  const n=Math.round(duration*sampleRate),buf=new ArrayBuffer(44+n*2),v=new DataView(buf);
  const write=(o,s)=>{for(let i=0;i<s.length;i++)v.setUint8(o+i,s.charCodeAt(i));};
  write(0,'RIFF');v.setUint32(4,36+n*2,true);write(8,'WAVE');write(12,'fmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);v.setUint32(24,sampleRate,true);v.setUint32(28,sampleRate*2,true);v.setUint16(32,2,true);v.setUint16(34,16,true);write(36,'data');v.setUint32(40,n*2,true);
  for(let i=0;i<n;i++)v.setInt16(44+i*2,Math.round(Math.sin(2*Math.PI*frequency*i/sampleRate)*0.5*32767),true);
  return new Uint8Array(buf);
}
function fixture(){
  const writes=[];
  const env={
    MELITURGOS_USER:'owner',
    MEL_MEDIA_ENCRYPTION_KEY_ID:'dsp-test',
    MEL_MEDIA_ENCRYPTION_KEY_B64:mediaKeyB64(),
    MEDIA_BUCKET:{async put(key,value,options){writes.push({key,value:new Uint8Array(value),options});}},
  };
  return{env,writes};
}

test('DSP audio analyzer measures real PCM waveform properties', async()=>{
  const f=fixture(),caps=createProceduralAudioCapabilities(f.env),input=wavTone({frequency:440,duration:1});
  const out=await caps['media.audio.analyze']({bytes:input});
  assert.equal(out.ok,true);
  assert.equal(out.provider,'mel-dsp');
  assert.equal(out.sample_rate,22050);
  assert.ok(out.duration_seconds>0.99&&out.duration_seconds<1.01);
  assert.ok(out.rms>0.3&&out.rms<0.4);
  assert.ok(Math.abs(out.dominant_frequency_hz-440)<20);
  assert.equal(out.dominant_note,'A4');
});

test('DSP music analyzer produces bounded tempo and acoustic evidence', async()=>{
  const f=fixture(),caps=createProceduralAudioCapabilities(f.env),input=wavTone({frequency:261.63,duration:2});
  const out=await caps['media.music.analyze']({bytes:input});
  assert.equal(out.ok,true);
  assert.equal(out.capability,'media.music.analyze');
  assert.ok(out.estimated_bpm===null||(out.estimated_bpm>=60&&out.estimated_bpm<=180));
  assert.ok(out.dominant_frequency_hz>240&&out.dominant_frequency_hz<285);
});

test('procedural sound generation creates a private encrypted WAV artifact', async()=>{
  const f=fixture(),caps=createProceduralAudioCapabilities(f.env);
  const out=await caps['media.audio.generate']({prompt:'notification chime',duration_seconds:1});
  assert.equal(out.ok,true);
  assert.equal(out.capability,'media.audio.generate');
  assert.equal(out.zero_added_cost,true);
  assert.equal(out.artifact.mime,'audio/wav');
  assert.equal(out.artifact.stored_encrypted,true);
  assert.equal(f.writes.length,1);
  assert.equal(f.writes[0].options.customMetadata.capability,'media.audio.generate');
});

test('procedural music generation creates real non-empty WAV audio with prompt-derived BPM', async()=>{
  const f=fixture(),caps=createProceduralAudioCapabilities(f.env);
  const out=await caps['media.music.generate']({prompt:'ambient cinematic 96 bpm',duration_seconds:4});
  assert.equal(out.ok,true);
  assert.equal(out.capability,'media.music.generate');
  assert.equal(out.bpm,96);
  assert.equal(out.artifact.mime,'audio/wav');
  assert.ok(out.artifact.size>100000);
  assert.equal(f.writes.length,1);
});

test('DSP generation fails closed when encrypted Media Vault is unavailable', ()=>{
  const caps=createProceduralAudioCapabilities({});
  assert.equal(typeof caps['media.audio.analyze'],'function');
  assert.equal(typeof caps['media.music.analyze'],'function');
  assert.equal(caps['media.audio.generate'],undefined);
  assert.equal(caps['media.music.generate'],undefined);
});
