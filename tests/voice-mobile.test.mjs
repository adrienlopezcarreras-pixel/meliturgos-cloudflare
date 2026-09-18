import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { handleVoiceTranscription } from '../src/api/voice-transcribe.js';
import { NORMAL_RUNTIME_SOURCE } from '../src/pages/mvp-runtime.js';

const auth='Basic '+Buffer.from('adrien:test').toString('base64');

function request(audio=new Blob(['audio'],{type:'audio/webm'})){
  const form=new FormData();form.append('audio',audio,'voice.webm');
  return new Request('https://mel.test/api/voice/transcribe',{method:'POST',headers:{authorization:auth},body:form});
}

test('canonical voice transcription uses one authenticated Workers AI route', async()=>{
  const response=await handleVoiceTranscription(request(),{
    MELITURGOS_USER:'adrien',MELITURGOS_PASSWORD:'test',
    AI:{async run(model){assert.equal(model,'@cf/openai/whisper-large-v3-turbo');return{text:'bonjour depuis le micro'}}}
  });
  assert.equal(response.status,200);
  assert.deepEqual(await response.json(),{ok:true,text:'bonjour depuis le micro',language:'fr',model:'@cf/openai/whisper-large-v3-turbo',stored:false});
});

test('voice fails closed to text when AI is unavailable and mobile UI releases microphone', async()=>{
  const response=await handleVoiceTranscription(request(),{MELITURGOS_USER:'adrien',MELITURGOS_PASSWORD:'test'});
  assert.equal(response.status,503);
  assert.equal((await response.json()).fallback,'text');

  const ui=NORMAL_RUNTIME_SOURCE;
  assert.match(ui,/navigator\.mediaDevices\?\.getUserMedia/);
  assert.match(ui,/new MediaRecorder/);
  assert.match(ui,/\/api\/voice\/transcribe/);
  assert.match(ui,/getTracks\(\)\.forEach/);
  assert.match(ui,/avatar\.addEventListener\('click'/);
});
