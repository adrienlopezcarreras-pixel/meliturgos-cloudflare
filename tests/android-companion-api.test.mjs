import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';
import { classifyHttpAuthSurface } from '../src/security/http-auth-policy.js';
import { sqliteD1 } from './helpers/sqlite-d1.mjs';
import { createConversationService } from '../src/conversations/conversation-service.js';

const ownerAuth='Basic '+Buffer.from('adrien:test').toString('base64');

function ownerRequest(path,method='GET',body=null){
  return new Request('https://mel.test'+path,{
    method,
    headers:{
      authorization:ownerAuth,
      ...(body?{'content-type':'application/json'}:{})
    },
    ...(body?{body:JSON.stringify(body)}:{})
  });
}

function deviceHeaders(deviceId,token,extra={}){
  return {authorization:'Bearer '+token,'x-mel-device-id':deviceId,...extra};
}

async function pair(env,deviceId='android-test-1'){
  const codeResponse=await worker.fetch(ownerRequest('/api/android/v1/pair-code','POST',{}),env);
  assert.equal(codeResponse.status,200);
  const code=(await codeResponse.json()).code;
  const pairResponse=await worker.fetch(new Request('https://mel.test/api/android/v1/pair',{
    method:'POST',
    headers:{'content-type':'application/json'},
    body:JSON.stringify({
      pair_code:code,
      device_id:deviceId,
      name:'Téléphone test',
      app_version:'0.1.0',
      protocol_version:'1.0'
    })
  }),env);
  assert.equal(pairResponse.status,200);
  return {code,...await pairResponse.json()};
}

test('Android companion API is delegated to device-token auth instead of global owner auth',()=>{
  const surface=classifyHttpAuthSurface(new Request('https://mel.test/api/android/v1/pair',{method:'POST'}));
  assert.equal(surface.kind,'DELEGATED_STRONG_AUTH');
});

test('Android pair codes are one-use and issue revocable device tokens without retaining owner credentials',async()=>{
  const DB=sqliteD1();
  try{
    const env={DB,MELITURGOS_USER:'adrien',MELITURGOS_PASSWORD:'test'};
    const paired=await pair(env);
    assert.equal(paired.protocol_version,'1.0');
    assert.equal(paired.token_storage,'ANDROID_KEYSTORE_REQUIRED');
    assert.ok(paired.token.length>=40);

    const replay=await worker.fetch(new Request('https://mel.test/api/android/v1/pair',{
      method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({pair_code:paired.code,device_id:'android-replay',protocol_version:'1.0'})
    }),env);
    assert.equal(replay.status,401);

    const row=await DB.prepare('SELECT token_hash,name FROM android_device_tokens WHERE device_id=?').bind(paired.device_id).first();
    assert.ok(row.token_hash);
    assert.notEqual(row.token_hash,paired.token);
    assert.equal(row.name,'Téléphone test');
  }finally{DB.close();}
});

test('Android heartbeat, chat, sync ACK and revocation work end-to-end',async()=>{
  const DB=sqliteD1();
  try{
    const env={
      DB,
      MELITURGOS_USER:'adrien',
      MELITURGOS_PASSWORD:'test',
      AI:{async run(model){
        if(String(model).includes('whisper')) return {text:'transcription android'};
        return {response:'réponse MEL Android'};
      }}
    };
    const paired=await pair(env,'android-e2e');
    const headers=deviceHeaders(paired.device_id,paired.token,{'content-type':'application/json'});

    const heartbeat=await worker.fetch(new Request('https://mel.test/api/android/v1/heartbeat',{
      method:'POST',headers,body:JSON.stringify({app_version:'0.1.0',sdk_int:35,battery:82,charging:true,network:'wifi'})
    }),env);
    assert.equal(heartbeat.status,200);
    assert.equal((await heartbeat.json()).accepted.sdk_int,35);

    const unauthorized=await worker.fetch(new Request('https://mel.test/api/android/v1/sync?conversation_id=android-e2e-conv',{
      headers:deviceHeaders(paired.device_id,'wrong-token')
    }),env);
    assert.equal(unauthorized.status,401);

    const chat=await worker.fetch(new Request('https://mel.test/api/android/v1/chat',{
      method:'POST',headers,
      body:JSON.stringify({text:'bonjour depuis android',conversation_id:'android-e2e-conv'})
    }),env);
    assert.equal(chat.status,200);
    const chatBody=await chat.json();
    assert.equal(chatBody.text,'réponse MEL Android');
    assert.equal(chatBody.archive_saved,true);

    const userRow=await DB.prepare("SELECT device_id,provenance FROM archive_messages WHERE conversation_id=? AND role='user' LIMIT 1")
      .bind('android-e2e-conv').first();
    assert.equal(userRow.device_id,'android-e2e');
    assert.equal(userRow.provenance,'native-chat');

    // The direct chat response is already consumed by this phone and advances
    // its checkpoint. Sync is for messages that arrive later from another
    // surface/device.
    const service=createConversationService(env);
    await service.archiveMessage({
      conversationId:'android-e2e-conv',
      role:'assistant',
      content:'message externe à synchroniser',
      timestamp:Date.now()+1000,
      provenance:'test:external-surface'
    });

    const sync1=await worker.fetch(new Request('https://mel.test/api/android/v1/sync?conversation_id=android-e2e-conv',{
      headers:deviceHeaders(paired.device_id,paired.token)
    }),env);
    assert.equal(sync1.status,200);
    const syncBody=await sync1.json();
    assert.ok(syncBody.messages.length>=1);
    const last=syncBody.messages.at(-1);
    assert.equal(last.role,'assistant');

    const ack=await worker.fetch(new Request('https://mel.test/api/android/v1/sync/ack',{
      method:'POST',headers,
      body:JSON.stringify({
        conversation_id:'android-e2e-conv',
        last_message_id:last.id,
        last_message_timestamp:last.timestamp
      })
    }),env);
    assert.equal(ack.status,200);

    const sync2=await worker.fetch(new Request('https://mel.test/api/android/v1/sync?conversation_id=android-e2e-conv',{
      headers:deviceHeaders(paired.device_id,paired.token)
    }),env);
    assert.equal(sync2.status,200);
    assert.equal((await sync2.json()).messages.length,0);

    const status=await worker.fetch(ownerRequest('/api/android/v1/status'),env);
    assert.equal(status.status,200);
    assert.ok((await status.json()).devices.some(d=>d.device_id==='android-e2e'));

    const revoke=await worker.fetch(ownerRequest('/api/android/v1/revoke','POST',{device_id:'android-e2e'}),env);
    assert.equal(revoke.status,200);

    const afterRevoke=await worker.fetch(new Request('https://mel.test/api/android/v1/heartbeat',{
      method:'POST',headers,body:'{}'
    }),env);
    assert.equal(afterRevoke.status,401);
  }finally{DB.close();}
});

test('Android voice route uses the canonical Whisper endpoint and returns chat handoff provenance',async()=>{
  const DB=sqliteD1();
  try{
    const env={
      DB,
      MELITURGOS_USER:'adrien',
      MELITURGOS_PASSWORD:'test',
      AI:{async run(model){
        assert.equal(model,'@cf/openai/whisper-large-v3-turbo');
        return {text:'dictée android réelle'};
      }}
    };
    const paired=await pair(env,'android-voice');
    const form=new FormData();
    form.append('audio',new Blob(['fake-webm'],{type:'audio/webm'}),'voice.webm');
    const response=await worker.fetch(new Request('https://mel.test/api/android/v1/voice/transcribe',{
      method:'POST',
      headers:deviceHeaders(paired.device_id,paired.token),
      body:form
    }),env);
    assert.equal(response.status,200);
    const body=await response.json();
    assert.equal(body.text,'dictée android réelle');
    assert.equal(body.input_source,'voice-server-transcription');
    assert.equal(body.archive_via,'chat');
  }finally{DB.close();}
});
