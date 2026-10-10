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

  // Real Aura contract: return a self-describing WAV stream instead of naked
  // bytes that MEL would have to guess about.
  const wav = new Uint8Array(48);
  const ascii = (offset, text) => {
    for (let i=0;i<text.length;i++) wav[offset+i] = text.charCodeAt(i);
  };
  const view = new DataView(wav.buffer);
  ascii(0,'RIFF');
  view.setUint32(4,40,true);
  ascii(8,'WAVE');
  ascii(12,'fmt ');
  view.setUint32(16,16,true);
  view.setUint16(20,1,true);
  view.setUint16(22,1,true);
  view.setUint32(24,48000,true);
  view.setUint32(28,96000,true);
  view.setUint16(32,2,true);
  view.setUint16(34,16,true);
  ascii(36,'data');
  view.setUint32(40,4,true);
  wav.set([0x00,0x00,0x00,0x01],44);

  const env = {
    DB: db,
    AI: {
      async run(model, input, options) {
        aiCall = { model, input, options };
        return new Response(wav, {
          status:200,
          headers:{'content-type':'audio/wav'}
        });
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
  assert.deepEqual(Array.from(out),Array.from(wav));
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


test('MINI prefers MEL Mobile and uses Wi-Fi only as transport fallback', async () => {
  const source = await readFile(
    new URL('../firmware/waveshare-terminal/main/mel_terminal.cpp', import.meta.url),
    'utf8'
  );
  assert.match(source,/if \(mel_mobile_bridge_ready\(\)\) \{/);
  assert.match(source,/MEL MOBILE transport failed .*falling back to Wi-Fi/);
  assert.match(source,/if \(!g_wifi_connected\) return ESP_ERR_INVALID_STATE/);
});

test('MINI BLE transport keeps reconnect protections enabled', async () => {
  const bridge = await readFile(
    new URL('../firmware/waveshare-terminal/main/mel_mobile_bridge.cpp', import.meta.url),
    'utf8'
  );
  const header = await readFile(
    new URL('../firmware/waveshare-terminal/main/mel_mobile_bridge.h', import.meta.url),
    'utf8'
  );
  const main = await readFile(
    new URL('../firmware/waveshare-terminal/main/main.cpp', import.meta.url),
    'utf8'
  );
  assert.match(bridge,/xQueueCreate\(32, sizeof\(NotifyFrame\)\)/);
  assert.match(bridge,/mel_mobile_bridge_keepalive\(void\)/);
  assert.match(bridge,/BLE_GAP_INITIAL_CONN_LATENCY/);
  assert.match(bridge,/BLE_GAP_INITIAL_SUPERVISION_TIMEOUT/);
  assert.match(header,/bool mel_mobile_bridge_keepalive\(void\);/);
  assert.match(main,/if \(keepalive_seconds >= 8\)/);
  assert.match(main,/mel_mobile_bridge_keepalive\(\);/);
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


test('MINI device chat preserves voice mode for fast spoken replies', async () => {
  const source = await readFile(
    new URL('../src/devices/waveshare-terminal-api.js', import.meta.url),
    'utf8'
  );
  assert.match(source, /input_source: inputSource/);
  assert.match(source, /voice_reply: voiceReply/);
  assert.match(source, /parallel: voiceReply \? false : body\.parallel === true/);
});


test('MINI spoken chat selects the bounded fast inference route', async () => {
  const source = await readFile(
    new URL('../src/api/native-chat.js', import.meta.url),
    'utf8'
  );
  assert.match(source, /taskOverride: voiceReply \? 'FAST'/);
  assert.match(source, /'@cf\/zai-org\/glm-4\.7-flash'/);
  assert.match(source, /timeoutMs: voiceReply \? 6000 : null/);
  assert.match(source, /maxCalls: voiceReply \? 1 : null/);
  assert.match(source, /VOICE_FAST_FALLBACK_TIMEOUT/);
});


test('MINI simple spoken chat has a direct low-latency route before native-chat', async () => {
  const source = await readFile(
    new URL('../src/devices/waveshare-terminal-api.js', import.meta.url),
    'utf8'
  );
  assert.match(source, /runMiniDirectVoice/);
  assert.match(source, /miniVoiceNeedsFullRuntime/);
  assert.match(source, /@cf\/zai-org\/glm-4\.7-flash/);
  assert.match(source, /timeoutMs: 4500/);
  assert.match(source, /response_mode: "mini-voice-fast"/);
  assert.match(source, /voiceReply && inputSource === "voice-server-transcription"/);
});
