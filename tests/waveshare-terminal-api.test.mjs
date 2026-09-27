import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
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


test('device TTS uses self-describing 48 kHz mono linear16 WAV for MINI playback', async () => {
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
        return new Response(new Uint8Array([
          0x52,0x49,0x46,0x46,0x28,0x00,0x00,0x00,0x57,0x41,0x56,0x45,
          0x66,0x6d,0x74,0x20,0x10,0x00,0x00,0x00,0x01,0x00,0x01,0x00,
          0x80,0xbb,0x00,0x00,0x00,0x77,0x01,0x00,0x02,0x00,0x10,0x00,
          0x64,0x61,0x74,0x61,0x04,0x00,0x00,0x00,0x00,0x00,0x00,0x01
        ]), { status:200, headers:{'content-type':'audio/wav'} });
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
  assert.equal(r.headers.get('content-type'),'audio/wav');
  assert.equal(r.headers.get('x-mel-audio-format'),'wav-pcm-s16le');
  assert.equal(r.headers.get('x-mel-audio-rate'),'48000');
  assert.equal(r.headers.get('x-mel-audio-channels'),'1');
  const out = new Uint8Array(await r.arrayBuffer());
  assert.equal(new TextDecoder().decode(out.slice(0,4)),'RIFF');
  assert.equal(new TextDecoder().decode(out.slice(8,12)),'WAVE');
  assert.equal(aiCall.model,'@cf/deepgram/aura-1');
  assert.deepEqual(aiCall.input,{
    text:'Bonjour MINI',
    speaker:'luna',
    encoding:'linear16',
    container:'wav',
    sample_rate:48000
  });
  assert.deepEqual(aiCall.options,{ returnRawResponse:true });
});


test('MINI firmware validates the WAV contract before writing to ES8311', async () => {
  const source = await readFile(
    new URL('../firmware/waveshare-terminal/main/mel_terminal.cpp', import.meta.url),
    'utf8'
  );
  assert.match(source,/memcmp\(riff, "RIFF", 4\)/);
  assert.match(source,/memcmp\(riff \+ 8, "WAVE", 4\)/);
  assert.match(source,/audio_format != 1/);
  assert.match(source,/channels != 1/);
  assert.match(source,/sample_rate != 48000/);
  assert.match(source,/bits_per_sample != 16/);
  assert.match(source,/TTS WAV header invalid; refusing audio playback/);
  assert.match(source,/TTS_MAX_PCM_BYTES/);
});
