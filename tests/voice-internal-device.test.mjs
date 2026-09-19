import test from 'node:test';
import assert from 'node:assert/strict';
import { handleVoiceTranscription } from '../src/api/voice-transcribe.js';

test('trusted terminal handoff skips operator auth but still validates audio input',async()=>{
  const r=await handleVoiceTranscription(new Request('https://mel.test/api/device/v1/voice/transcribe',{
    method:'POST',
    headers:{'content-type':'application/json'},
    body:'{}'
  }),{}, {authorized:true,source:'waveshare-terminal'});
  assert.equal(r.status,415);
  assert.equal((await r.json()).code,'AUDIO_REQUIRED');
});
