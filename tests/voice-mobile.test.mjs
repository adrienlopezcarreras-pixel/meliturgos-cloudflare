import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { handleVoiceTranscription } from '../src/api/voice-transcribe.js';
import { handleNativeChat } from '../src/api/native-chat.js';
import { NORMAL_RUNTIME_SOURCE } from '../src/pages/mvp-runtime.js';
import { sqliteD1 } from './helpers/sqlite-d1.mjs';

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
  assert.deepEqual(await response.json(),{ok:true,text:'bonjour depuis le micro',language:'fr',model:'@cf/openai/whisper-large-v3-turbo',stored:false,archive_via:'chat',input_source:'voice-server-transcription'});
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
  assert.match(ui,/input_source:item\.source\|\|'text'/);
  assert.match(ui,/queueMessage\(d\.text,'voice-server-transcription'\)/);
  assert.match(ui,/queueMessage\(final,'voice-browser-recognition'\)/);
});

test('voice-origin chat is durably archived with bounded provenance metadata', async()=>{
  const DB=sqliteD1();
  try{
    const env={
      DB,
      MELITURGOS_USER:'adrien',
      MELITURGOS_PASSWORD:'test',
      AI:{async run(){return{response:'réponse vocale ok'}}},
    };
    const response=await handleNativeChat(new Request('https://mel.test/api/chat',{
      method:'POST',
      headers:{authorization:auth,'content-type':'application/json'},
      body:JSON.stringify({
        text:'bonjour depuis une transcription',
        conversation_id:'voice-provenance-test',
        input_source:'voice-server-transcription',
      }),
    }),env);
    assert.equal(response.status,200);
    const body=await response.json();
    assert.equal(body.input_source,'voice-server-transcription');
    assert.equal(body.archive_saved,true);
    const row=await DB.prepare("SELECT provenance, metadata FROM archive_messages WHERE conversation_id=? AND role='user' LIMIT 1")
      .bind('voice-provenance-test').first();
    assert.equal(row.provenance,'native-chat:voice-server-transcription');
    assert.deepEqual(JSON.parse(row.metadata),{input_source:'voice-server-transcription',transcribed_voice:true});
  }finally{DB.close();}
});

test('untrusted input_source values cannot forge archive provenance', async()=>{
  const DB=sqliteD1();
  try{
    const env={
      DB,
      MELITURGOS_USER:'adrien',
      MELITURGOS_PASSWORD:'test',
      AI:{async run(){return{response:'ok'}}},
    };
    const response=await handleNativeChat(new Request('https://mel.test/api/chat',{
      method:'POST',
      headers:{authorization:auth,'content-type':'application/json'},
      body:JSON.stringify({
        text:'message normal',
        conversation_id:'voice-provenance-forgery-test',
        input_source:'admin-forged-source',
      }),
    }),env);
    assert.equal(response.status,200);
    assert.equal((await response.json()).input_source,'text');
    const row=await DB.prepare("SELECT provenance, metadata FROM archive_messages WHERE conversation_id=? AND role='user' LIMIT 1")
      .bind('voice-provenance-forgery-test').first();
    assert.equal(row.provenance,'native-chat');
    assert.deepEqual(JSON.parse(row.metadata),{});
  }finally{DB.close();}
});
