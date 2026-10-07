import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root=new URL('../',import.meta.url);

test('Link V2 physical STT captures 48 kHz and decimates to real 16 kHz before ADPCM transport',async()=>{
  const [terminal,transport,codec,protocol]=await Promise.all([
    readFile(new URL('firmware/waveshare-terminal/main/mel_terminal.cpp',root),'utf8'),
    readFile(new URL('firmware/waveshare-terminal/main/mel_link_v2_transport.cpp',root),'utf8'),
    readFile(new URL('firmware/waveshare-terminal/main/mel_ima_adpcm.h',root),'utf8'),
    readFile(new URL('firmware/waveshare-terminal/main/mel_link_v2_protocol.h',root),'utf8'),
  ]);

  assert.match(terminal,/VOICE_CAPTURE_RATE = 48000/);
  assert.match(terminal,/VOICE_STT_RATE = 16000/);
  assert.match(terminal,/VOICE_DECIMATOR_Q15/);
  assert.match(terminal,/const int speech_samples = captured_samples \/ 3/);
  assert.match(terminal,/decimate_48k_to_16k/);
  assert.match(terminal,/mel_link_v2_transport_transcribe_adpcm\(/);
  assert.doesNotMatch(terminal,/application\/x-mel-pcm4/);
  assert.doesNotMatch(terminal,/samples_per_byte=2/);

  assert.match(codec,/MEL_IMA_ADPCM_BLOCK_SAMPLES 256/);
  assert.match(codec,/MEL_IMA_ADPCM_MAX_ENCODED_BYTES 132/);
  assert.match(protocol,/MEL_LINK_V2_HEADER_SIZE 13/);
  assert.ok(132+13 < 185-3,'one ADPCM block must fit inside an ATT value at MTU 185');

  assert.match(transport,/MEL_LINK_V2_AUDIO_BEGIN/);
  assert.match(transport,/MEL_LINK_V2_AUDIO_DATA/);
  assert.match(transport,/MEL_LINK_V2_AUDIO_END/);
  assert.match(transport,/mel_ima_adpcm_encode_block/);
  assert.match(transport,/xSemaphoreTake\(g_credit_sem/);
});

test('Android decodes V2 ADPCM to canonical WAV and uses delegated MINI STT provenance',async()=>{
  const [service,codec,api,serverApi]=await Promise.all([
    readFile(new URL('android-companion/app/src/main/java/fr/veriteinterdite/mel/MelLinkV2ClientService.kt',root),'utf8'),
    readFile(new URL('android-companion/app/src/main/java/fr/veriteinterdite/mel/MelImaAdpcm.kt',root),'utf8'),
    readFile(new URL('android-companion/app/src/main/java/fr/veriteinterdite/mel/MelApiClient.kt',root),'utf8'),
    readFile(new URL('src/devices/android-companion-api.js',root),'utf8'),
  ]);

  assert.match(service,/MelLinkV2Protocol\.AUDIO_BEGIN/);
  assert.match(service,/MelLinkV2Protocol\.AUDIO_DATA/);
  assert.match(service,/MelLinkV2Protocol\.AUDIO_END/);
  assert.match(service,/MelImaAdpcm\.decodeBlock/);
  assert.match(service,/AUDIO_SEQUENCE/);
  assert.match(service,/AUDIO_LENGTH/);
  assert.match(service,/pcm16MonoWav\(samples, 16_000\)/);
  assert.match(service,/miniDeviceConnection\(/);
  assert.match(service,/\/api\/device\/v1\/voice\/transcribe/);
  assert.match(service,/Authorization", "Bearer \$miniToken"/);
  assert.match(service,/MiniTokenVault\(this\)\.load\(miniDeviceId\)/);

  assert.match(codec,/const val BLOCK_SAMPLES = 256/);
  assert.match(codec,/const val MAX_ENCODED_BYTES = 132/);
  assert.match(codec,/fun pcm16MonoWav/);
  assert.match(api,/\/api\/android\/v1\/mini\/voice\/transcribe/);
  assert.match(api,/X-MEL-MINI-Device-ID/);
  assert.match(serverApi,/handleAndroidDelegatedMiniRequest/);
});

test('Link V2 audio/server failure remains a stream failure, not a physical BLE reset',async()=>{
  const [server,transport,android]=await Promise.all([
    readFile(new URL('firmware/waveshare-terminal/main/mel_link_v2_server.cpp',root),'utf8'),
    readFile(new URL('firmware/waveshare-terminal/main/mel_link_v2_transport.cpp',root),'utf8'),
    readFile(new URL('android-companion/app/src/main/java/fr/veriteinterdite/mel/MelLinkV2ClientService.kt',root),'utf8'),
  ]);

  assert.match(transport,/ADPCM STT response timeout/);
  assert.match(transport,/BT_AUDIO_BEGIN_SEND/);
  assert.match(transport,/BT_AUDIO_DATA_SEND_%u/);
  assert.match(transport,/BT_AUDIO_END_SEND/);
  assert.match(transport,/BT_SESSION_DROPPED_/);
  assert.doesNotMatch(transport,/ble_gap_terminate/);
  assert.doesNotMatch(transport,/start_scan/);
  assert.match(server,/BLE_GAP_EVENT_DISCONNECT/);
  assert.match(android,/sendErrorAsync/);
  assert.doesNotMatch(android,/cancelConnection/);
});


test('MINI audio begin/end use notifications because CREDIT/response provide app-level acknowledgement', async () => {
  const transport = await readFile(
    new URL('../firmware/waveshare-terminal/main/mel_link_v2_transport.cpp', import.meta.url),
    'utf8'
  );
  assert.match(
    transport,
    /MEL_LINK_V2_AUDIO_BEGIN,[\s\S]*?\(uint16_t\)meta\.size\(\), false/
  );
  assert.match(
    transport,
    /MEL_LINK_V2_AUDIO_END,[\s\S]*?nullptr, 0, false/
  );
});


test('MINI generic request begin/end use notifications with CREDIT/response acknowledgement', async () => {
  const transport = await readFile(
    new URL('../firmware/waveshare-terminal/main/mel_link_v2_transport.cpp', import.meta.url),
    'utf8'
  );
  assert.match(
    transport,
    /MEL_LINK_V2_REQUEST_BEGIN,[\s\S]*?\(uint16_t\)meta\.size\(\), false/
  );
  assert.match(
    transport,
    /MEL_LINK_V2_REQUEST_END,[\s\S]*?nullptr, 0, false/
  );
  assert.match(transport, /BT_REQUEST_BEGIN_SEND/);
  assert.match(transport, /BT_REQUEST_CREDIT_TIMEOUT/);
  assert.match(transport, /BT_REQUEST_END_SEND/);
});


test('Link V2 TTS preserves canonical 48 kHz PCM and never streams HTTP errors as PCM', async () => {
  const [service, transport, terminal] = await Promise.all([
    readFile(new URL('android-companion/app/src/main/java/fr/veriteinterdite/mel/MelLinkV2ClientService.kt', root), 'utf8'),
    readFile(new URL('firmware/waveshare-terminal/main/mel_link_v2_transport.cpp', root), 'utf8'),
    readFile(new URL('firmware/waveshare-terminal/main/mel_terminal.cpp', root), 'utf8'),
  ]);
  assert.match(service, /decodePcm16MonoWav\(body, 48_000\)/);
  assert.match(service, /decodePcm16MonoWav\(body, 48_000\)/);
  assert.match(transport, /g_active\.cb && g_active\.status >= 200 && g_active\.status < 300/);
  assert.match(terminal, /TTS SANS AUDIO/);
  assert.match(terminal, /TTS HTTP %d/);
  assert.match(terminal, /voice_tts_text/);
});

test('MINI response viewer transliterates unsupported UTF-8 glyphs instead of drawing squares', async () => {
  const main = await readFile(
    new URL('firmware/waveshare-terminal/main/main.cpp', root),
    'utf8'
  );
  assert.match(main, /mini_display_ascii/);
  assert.match(main, /lv_obj_set_style_text_font\(answer_label, &lv_font_montserrat_16/);
  assert.match(main, /const std::string safe = mini_display_ascii\(text\)/);
});


test('Waveshare ES8311 path uses 48 kHz physical capture/playback with 16 kHz STT', async () => {
  const [terminal, transport, service, main] = await Promise.all([
    readFile(new URL('firmware/waveshare-terminal/main/mel_terminal.cpp', root), 'utf8'),
    readFile(new URL('firmware/waveshare-terminal/main/mel_link_v2_transport.cpp', root), 'utf8'),
    readFile(new URL('android-companion/app/src/main/java/fr/veriteinterdite/mel/MelLinkV2ClientService.kt', root), 'utf8'),
    readFile(new URL('firmware/waveshare-terminal/main/main.cpp', root), 'utf8'),
  ]);
  assert.match(terminal, /VOICE_CAPTURE_RATE = 48000/);
  assert.match(terminal, /VOICE_DECIMATOR_Q15/);
  assert.match(transport, /output_rate->valueint == 48000/);
  assert.match(transport, /deliver_audio_48k_native/);
  assert.doesNotMatch(transport, /deliver_audio_16k_native/);
  assert.match(service, /sendAudioResponse\(request\.streamId, pcm48, outputRate = 48_000\)/);
  assert.match(main, /sample_count = 2 \* 48000/);
});


test('STT Link V2 uses asynchronous notifications with batched Android credits', async () => {
  const [server, transport, service] = await Promise.all([
    readFile(new URL('firmware/waveshare-terminal/main/mel_link_v2_server.cpp', root), 'utf8'),
    readFile(new URL('firmware/waveshare-terminal/main/mel_link_v2_transport.cpp', root), 'utf8'),
    readFile(new URL('android-companion/app/src/main/java/fr/veriteinterdite/mel/MelLinkV2ClientService.kt', root), 'utf8'),
  ]);
  assert.match(server, /if \(!indicate\)/);
  assert.match(server, /event->notify_tx\.indication/);
  assert.match(server, /notification tx status=%d/);
  assert.match(transport, /pdMS_TO_TICKS\(45000\)/);
  assert.match(transport, /progress_cb\(offset, sample_count, progress_ctx\)/);
  assert.match(service, /var creditsConsumed: Int = 0/);
  assert.match(service, /CREDIT_WINDOW \/ 2/);
  assert.match(service, /MelLinkV2Protocol\.AUDIO_DATA[\s\S]*?audio\.creditsConsumed\+\+[\s\S]*?sendCreditAsync\(frame\.streamId, audio\.creditsConsumed\)/);
});


test('Android-to-MINI response and TTS bulk uses acknowledged writes for connection stability', async () => {
  const [service, transport] = await Promise.all([
    readFile(new URL('android-companion/app/src/main/java/fr/veriteinterdite/mel/MelLinkV2ClientService.kt', root), 'utf8'),
    readFile(new URL('firmware/waveshare-terminal/main/mel_link_v2_transport.cpp', root), 'utf8'),
  ]);
  assert.match(service, /private fun sendBulkBlocking\(frame: ByteArray\): Boolean/);
  assert.match(service, /writeGattBlocking\(bulkRx, frame, BluetoothGattCharacteristic\.WRITE_TYPE_DEFAULT\)/);
  assert.match(service, /RESPONSE_DATA[\s\S]*?sendBulkBlocking/);
  assert.match(service, /AUDIO_DATA[\s\S]*?sendBulkBlocking/);
  assert.doesNotMatch(transport, /send_credit\(header\.stream_id, MEL_LINK_V2_CREDIT_WINDOW\)/);
  assert.doesNotMatch(transport, /send_credit\(header\.stream_id, 1\)/);
});


test('MINI STT falls back to direct Wi-Fi when Link V2 transcription fails', async () => {
  const terminal = await readFile(new URL('firmware/waveshare-terminal/main/mel_terminal.cpp', root), 'utf8');
  assert.match(terminal,/static esp_err_t http_request_wifi_direct\(/);
  assert.match(terminal,/STT V2 failed err=.*retrying direct Wi-Fi/);
  assert.match(terminal,/if \(\(err != ESP_OK \|\| status != 200\) && g_wifi_connected\)/);
  assert.match(terminal,/err = transcribe_wifi_direct\(\)/);
  assert.match(terminal,/STT WIFI DIRECT RESULT/);
});
