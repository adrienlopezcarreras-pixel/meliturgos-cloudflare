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
      body:JSON.stringify({text:'bonjour depuis android',conversation_id:'android-e2e-conv',ui_mode:'complete',ui_theme:'futuristic'})
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


test('Android voice fallback accepts M4A audio multipart as well as WebM',async()=>{
  const DB=sqliteD1();
  try{
    const env={
      DB,
      MELITURGOS_USER:'adrien',
      MELITURGOS_PASSWORD:'test',
      AI:{async run(model,input){
        assert.equal(model,'@cf/openai/whisper-large-v3-turbo');
        assert.equal(typeof input.audio,'string');
        assert.ok(input.audio.length>0);
        return {text:'dictée m4a android'};
      }}
    };
    const paired=await pair(env,'android-voice-m4a');
    const form=new FormData();
    form.append('audio',new Blob(['fake-m4a'],{type:'audio/mp4'}),'voice.m4a');
    const response=await worker.fetch(new Request('https://mel.test/api/android/v1/voice/transcribe',{
      method:'POST',headers:deviceHeaders(paired.device_id,paired.token),body:form
    }),env);
    assert.equal(response.status,200);
    assert.equal((await response.json()).text,'dictée m4a android');
  }finally{DB.close();}
});


test('Android TTS route matches MINI Luna PCM contract and rejects invalid device auth',async()=>{
  const DB=sqliteD1();
  try{
    let aiCall=null;
    const env={
      DB,
      MELITURGOS_USER:'adrien',
      MELITURGOS_PASSWORD:'test',
      AI:{
        async run(model,input,options){
          aiCall={model,input,options};
          return new Response(new Uint8Array([1,2,3,4,5,6]),{status:200});
        }
      }
    };
    const paired=await pair(env,'android-tts');
    const headers=deviceHeaders(paired.device_id,paired.token,{'content-type':'application/json'});
    const response=await worker.fetch(new Request('https://mel.test/api/android/v1/voice/tts',{
      method:'POST',headers,body:JSON.stringify({text:'Bonjour Adrien',speaker:'luna'})
    }),env);
    assert.equal(response.status,200);
    assert.equal(response.headers.get('x-mel-audio-format'),'pcm-s16le');
    assert.equal(response.headers.get('x-mel-audio-rate'),'48000');
    assert.equal(response.headers.get('x-mel-audio-channels'),'1');
    assert.equal(response.headers.get('x-mel-speaker'),'luna');
    assert.deepEqual([...new Uint8Array(await response.arrayBuffer())],[1,2,3,4,5,6]);
    assert.equal(aiCall.model,'@cf/deepgram/aura-1');
    assert.deepEqual(aiCall.input,{text:'Bonjour Adrien',speaker:'luna',encoding:'linear16',container:'none',sample_rate:48000});
    assert.deepEqual(aiCall.options,{returnRawResponse:true});

    const denied=await worker.fetch(new Request('https://mel.test/api/android/v1/voice/tts',{
      method:'POST',
      headers:deviceHeaders(paired.device_id,'wrong-token',{'content-type':'application/json'}),
      body:JSON.stringify({text:'test'})
    }),env);
    assert.equal(denied.status,401);
  }finally{DB.close();}
});

test('Android companion route exposes paired MINI status to the phone without owner credentials',async()=>{
  const DB=sqliteD1();
  try{
    const env={DB,MELITURGOS_USER:'adrien',MELITURGOS_PASSWORD:'test'};
    const paired=await pair(env,'android-companion-view');
    await DB.prepare(`CREATE TABLE IF NOT EXISTS device_tokens (
      device_id TEXT PRIMARY KEY, token_hash TEXT NOT NULL, model TEXT NOT NULL,
      created_at INTEGER NOT NULL, last_seen_at INTEGER NOT NULL, revoked_at INTEGER
    )`).run();
    await DB.prepare(`CREATE TABLE IF NOT EXISTS device_status (
      device_id TEXT PRIMARY KEY, payload_json TEXT NOT NULL DEFAULT '{}', updated_at INTEGER NOT NULL
    )`).run();
    const now=Date.now();
    await DB.prepare('INSERT INTO device_tokens(device_id,token_hash,model,created_at,last_seen_at,revoked_at) VALUES(?,?,?,?,?,NULL)')
      .bind('mini-test','hash','waveshare-esp32-s3-touch-lcd-3.5-c',now,now).run();
    await DB.prepare('INSERT INTO device_status(device_id,payload_json,updated_at) VALUES(?,?,?)')
      .bind('mini-test',JSON.stringify({name:'MINI salon',phase:'ONLINE',battery:91,camera:true,microphone:true,wifi_rssi:-48}),now).run();

    const response=await worker.fetch(new Request('https://mel.test/api/android/v1/companions',{
      headers:deviceHeaders(paired.device_id,paired.token)
    }),env);
    assert.equal(response.status,200);
    const body=await response.json();
    assert.equal(body.devices.length,1);
    assert.equal(body.devices[0].name,'MINI salon');
    assert.equal(body.devices[0].online,true);
    assert.equal(body.devices[0].camera,true);
    assert.equal(body.devices[0].microphone,true);

    const denied=await worker.fetch(new Request('https://mel.test/api/android/v1/companions',{
      headers:deviceHeaders(paired.device_id,'wrong-token')
    }),env);
    assert.equal(denied.status,401);
  }finally{DB.close();}
});

test('Android file route accepts device-token uploads without owner credentials',async()=>{
  const DB=sqliteD1();
  try{
    const env={DB,MELITURGOS_USER:'adrien',MELITURGOS_PASSWORD:'test'};
    const paired=await pair(env,'android-file');
    const form=new FormData();
    form.append('file',new Blob(['contenu texte android'],{type:'text/plain'}),'note.txt');
    const response=await worker.fetch(new Request('https://mel.test/api/android/v1/files/upload',{
      method:'POST',
      headers:deviceHeaders(paired.device_id,paired.token),
      body:form
    }),env);
    assert.equal(response.status,200);
    const body=await response.json();
    assert.equal(body.ok,true);
    assert.equal(body.name,'note.txt');
    assert.equal(body.preview_text,'contenu texte android');
    assert.equal(body.private,true);

    const deniedForm=new FormData();
    deniedForm.append('file',new Blob(['x'],{type:'text/plain'}),'x.txt');
    const denied=await worker.fetch(new Request('https://mel.test/api/android/v1/files/upload',{
      method:'POST',
      headers:deviceHeaders(paired.device_id,'wrong-token'),
      body:deniedForm
    }),env);
    assert.equal(denied.status,401);
  }finally{DB.close();}
});
