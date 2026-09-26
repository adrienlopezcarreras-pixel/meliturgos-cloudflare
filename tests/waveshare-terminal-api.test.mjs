import test from 'node:test';
import assert from 'node:assert/strict';
import {
  maybeHandleWaveshareTerminalApi,
  WAVESHARE_TERMINAL_API,
  WAVESHARE_TERMINAL_MODEL,
  WAVESHARE_TERMINAL_PROTOCOL,
  WAVESHARE_TERMINAL_CAPABILITIES
} from '../src/devices/waveshare-terminal-api.js';

test('Waveshare terminal API uses the canonical namespace and supported board model', () => {
  assert.equal(WAVESHARE_TERMINAL_API, '/api/device/v1');
  assert.equal(WAVESHARE_TERMINAL_MODEL, 'waveshare-esp32-s3-touch-lcd-3.5-c');
  assert.equal(WAVESHARE_TERMINAL_PROTOCOL, '1.0');
});

test('unrelated requests are ignored by the terminal handler', async () => {
  const response = await maybeHandleWaveshareTerminalApi(
    new Request('https://mel.test/api/other'),
    {}
  );
  assert.equal(response, null);
});

test('pairing remains owner-auth protected', async () => {
  const response = await maybeHandleWaveshareTerminalApi(
    new Request('https://mel.test/api/device/v1/pair', {
      method: 'POST',
      headers: {'content-type':'application/json'},
      body: JSON.stringify({device_id:'test-device'})
    }),
    { MELITURGOS_USER: 'owner', MELITURGOS_PASSWORD: 'configured-secret' }
  );
  assert.equal(response.status, 401);
  assert.equal((await response.json()).code, 'AUTH_REQUIRED');
});


test('Waveshare terminal capability contract does not overclaim unimplemented hardware', () => {
  assert.deepEqual([...WAVESHARE_TERMINAL_CAPABILITIES], [
    'display.touch',
    'camera.ov5640',
    'audio.microphone',
    'audio.speaker',
    'storage.internal',
    'wifi',
    'chat',
    'voice.stt',
    'voice.reply',
    'download.assets',
    'ota'
  ]);
  assert.equal(WAVESHARE_TERMINAL_CAPABILITIES.includes('bluetooth'), false);
  assert.equal(WAVESHARE_TERMINAL_CAPABILITIES.includes('storage.microsd'), false);
  assert.equal(WAVESHARE_TERMINAL_CAPABILITIES.includes('imu.qmi8658'), false);
  assert.equal(WAVESHARE_TERMINAL_CAPABILITIES.includes('rtc.pcf85063'), false);
});


test('device TTS uses raw 48 kHz linear16 audio compatible with ES8311 playback', async () => {
  let aiCall = null;
  const db = {
    prepare(sql) {
      return {
        bind() { return this; },
        async run() { return { success:true }; },
        async first() {
          if (sql.includes('SELECT device_id,model,revoked_at FROM device_tokens')) {
            return { device_id:'mini-test', model:WAVESHARE_TERMINAL_MODEL, revoked_at:null };
          }
          return null;
        }
      };
    }
  };
  const env = {
    DB: db,
    AI: {
      async run(model, input, options) {
        aiCall = { model, input, options };
        return new Response(new Uint8Array([0x01,0x02,0x03,0x04]), { status:200 });
      }
    }
  };
  const r = await maybeHandleWaveshareTerminalApi(
    new Request('https://mel.test/api/device/v1/voice/tts', {
      method:'POST',
      headers:{
        authorization:'Bearer test-token',
        'x-mel-device-id':'mini-test',
        'content-type':'application/json'
      },
      body:JSON.stringify({ text:'Bonjour MINI', speaker:'luna' })
    }),
    env
  );
  assert.equal(r.status,200);
  assert.equal(r.headers.get('x-mel-audio-format'),'pcm-s16le');
  assert.equal(r.headers.get('x-mel-audio-rate'),'48000');
  assert.equal(r.headers.get('x-mel-audio-channels'),'1');
  assert.deepEqual([...new Uint8Array(await r.arrayBuffer())],[1,2,3,4]);
  assert.equal(aiCall.model,'@cf/deepgram/aura-1');
  assert.deepEqual(aiCall.input,{
    text:'Bonjour MINI',
    speaker:'luna',
    encoding:'linear16',
    container:'none',
    sample_rate:48000
  });
  assert.deepEqual(aiCall.options,{ returnRawResponse:true });
});
