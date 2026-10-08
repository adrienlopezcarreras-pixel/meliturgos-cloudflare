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
  assert.match(terminal, /TTS BLE -> SECOURS/);
  assert.match(terminal, /TTS HTTP %d/);
  assert.match(terminal, /voice_tts_text/);
  assert.match(terminal, /speaker_output_enable\(100\.0\)/);
  assert.doesNotMatch(
    terminal.slice(
      terminal.indexOf('static bool speaker_output_enable'),
      terminal.indexOf('static bool g_voice_output_enabled')
    ),
    /esp_codec_dev_set_out_mute/
  );
  assert.match(terminal, /mel_terminal_test_speaker_local/);
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


test('Android-to-MINI response uses acknowledged writes while TTS uses credit-controlled no-response bulk', async () => {
  const [service, transport] = await Promise.all([
    readFile(new URL('android-companion/app/src/main/java/fr/veriteinterdite/mel/MelLinkV2ClientService.kt', root), 'utf8'),
    readFile(new URL('firmware/waveshare-terminal/main/mel_link_v2_transport.cpp', root), 'utf8'),
  ]);
  assert.match(service, /private fun sendBulkBlocking\(frame: ByteArray\): Boolean/);
  assert.match(service, /writeGattBlocking\(bulkRx, frame, BluetoothGattCharacteristic\.WRITE_TYPE_DEFAULT\)/);
  assert.match(service, /RESPONSE_DATA[\s\S]*?sendBulkBlocking/);
  assert.match(service, /AUDIO_DATA[\s\S]*?sendBulkNoResponse/);
  assert.match(service, /beginOutboundTransfer\(streamId\)/);
  assert.match(service, /awaitOutboundCredit\(streamId, credits\)/);
  assert.match(transport, /MEL_LINK_V2_CREDIT/);
  assert.match(transport, /credit_payload\[2\] = \{1, 0\}/);
});


test('MINI STT falls back to direct Wi-Fi when Link V2 transcription fails', async () => {
  const terminal = await readFile(new URL('firmware/waveshare-terminal/main/mel_terminal.cpp', root), 'utf8');
  assert.match(terminal,/static esp_err_t http_request_wifi_direct\(/);
  assert.match(terminal,/STT V2 failed err=.*retrying direct Wi-Fi/);
  assert.match(terminal,/if \(\(err != ESP_OK \|\| status != 200\) && g_wifi_connected\)/);
  assert.match(terminal,/err = transcribe_wifi_direct\(\)/);
  assert.match(terminal,/STT WIFI DIRECT RESULT/);
});


test('MINI uses codec driver with shared ES8311 instance support and STOP cancels active TTS transport', async () => {
  const [deps, transport, terminal] = await Promise.all([
    readFile(new URL('firmware/waveshare-terminal/main/idf_component.yml', root), 'utf8'),
    readFile(new URL('firmware/waveshare-terminal/main/mel_link_v2_transport.cpp', root), 'utf8'),
    readFile(new URL('firmware/waveshare-terminal/main/mel_terminal.cpp', root), 'utf8'),
  ]);
  assert.match(deps, /espressif\/esp_codec_dev:\s*"1\.6\.2"/);
  assert.match(transport, /mel_link_v2_transport_cancel_active/);
  assert.match(transport, /g_cancel_active\.store\(true\)/);
  assert.match(transport, /xSemaphoreGive\(g_response_done\)/);
  assert.match(terminal, /mel_link_v2_transport_cancel_active\(\)/);
  assert.match(terminal, /ui_status\("VOIX STOP"\)/);
});


test('STOP VOIX propagates a CANCEL frame to Android and aborts outbound TTS immediately', async () => {
  const [transport, service] = await Promise.all([
    readFile(new URL('../firmware/waveshare-terminal/main/mel_link_v2_transport.cpp', import.meta.url), 'utf8'),
    readFile(new URL('../android-companion/app/src/main/java/fr/veriteinterdite/mel/MelLinkV2ClientService.kt', import.meta.url), 'utf8'),
  ]);
  assert.match(transport, /static const char kCancel\[\] = "CANCEL"/);
  assert.match(transport, /MEL_LINK_V2_ERROR,[\s\S]*?kCancel/);
  assert.match(service, /MelLinkV2Protocol\.ERROR ->/);
  assert.match(service, /code == "CANCEL"/);
  assert.match(service, /cancelledOutbound\.add\(frame\.streamId\)/);
  assert.match(service, /outboundCancelled\(streamId\)/);
  assert.match(service, /REQUEST_BEGIN -> \{[\s\S]*?cancelledOutbound\.remove\(frame\.streamId\)/);
});


test('MINI TTS never writes the codec directly from the BLE receive callback', async () => {
  const terminal = await readFile(new URL('../firmware/waveshare-terminal/main/mel_terminal.cpp', import.meta.url), 'utf8');
  const callbackStart = terminal.indexOf('static bool mobile_tts_chunk');
  const callbackEnd = terminal.indexOf('static std::string voice_tts_text', callbackStart);
  const callback = terminal.slice(callbackStart, callbackEnd);
  assert.match(terminal, /xQueueCreate\(24, sizeof\(MobileTtsPacket\)\)/);
  assert.match(terminal, /mobile_tts_playback_task/);
  assert.match(terminal, /xTaskCreatePinnedToCore\([\s\S]*?"mel_tts_play"[\s\S]*?,\s*1\s*\)/);
  assert.match(callback, /xQueueSend\(ctx->queue/);
  assert.doesNotMatch(callback, /esp_codec_dev_write/);
  assert.match(terminal, /TTS audio task codec write failed/);
  assert.match(terminal, /mobile_tts_finish\(&ctx\)/);
});


test('MINI keeps the proven ES8311 playback path unmuted and gates silence by volume', async () => {
  const terminal = await readFile(new URL('../firmware/waveshare-terminal/main/mel_terminal.cpp', import.meta.url), 'utf8');
  const enableStart = terminal.indexOf('static bool speaker_output_enable');
  const disableEnd = terminal.indexOf('static bool g_voice_output_enabled', enableStart);
  const helpers = terminal.slice(enableStart, disableEnd);
  assert.match(helpers, /esp_codec_dev_set_out_vol\(output_dev, volume\)/);
  assert.match(helpers, /esp_codec_dev_set_out_vol\(output_dev, 0\.0\)/);
  assert.doesNotMatch(helpers, /esp_codec_dev_set_out_mute/);
  assert.match(terminal, /Known-good 48 kHz WAV playback never toggled the ES8311 mute bit/);
});


test('MINI chat relay outlives Android backend read timeout', async () => {
  const [transport, service] = await Promise.all([
    readFile(new URL('../firmware/waveshare-terminal/main/mel_link_v2_transport.cpp', import.meta.url), 'utf8'),
    readFile(new URL('../android-companion/app/src/main/java/fr/veriteinterdite/mel/MelLinkV2ClientService.kt', import.meta.url), 'utf8'),
  ]);
  assert.match(transport, /chat \? 130000/);
  assert.match(service, /path == "\/api\/device\/v1\/chat"\) 120_000 else 90_000/);
  assert.doesNotMatch(transport, /chat \? 20000/);
});


test('MINI reasserts ES8311 unmute before every playback', async () => {
  const [terminal, codec] = await Promise.all([
    readFile(new URL('../firmware/waveshare-terminal/main/mel_terminal.cpp', import.meta.url), 'utf8'),
    readFile(new URL('../firmware/waveshare-terminal/vendor/esp_es8311_port.cpp', import.meta.url), 'utf8'),
  ]);
  const enableStart = terminal.indexOf('static bool speaker_output_enable');
  const enableEnd = terminal.indexOf('static void speaker_output_disable', enableStart);
  const enable = terminal.slice(enableStart, enableEnd);
  assert.match(enable, /esp_codec_dev_set_out_mute\(output_dev, false\)/);
  assert.match(enable, /esp_codec_dev_set_out_vol\(output_dev, volume\)/);
  assert.match(codec, /esp_codec_dev_set_out_mute\(output_dev, false\)/);
});


test('MINI enables Waveshare PA_CTRL on TCA9554 P2 before audio init', async () => {
  const main = await readFile(new URL('../firmware/waveshare-terminal/main/main.cpp', import.meta.url), 'utf8');
  const expander = main.slice(main.indexOf('static void io_expander_init()'), main.indexOf('static void lv_port_init()'));
  const appMain = main.slice(main.indexOf('extern "C" void app_main'));
  assert.match(expander, /IO_EXPANDER_PIN_NUM_1 \| IO_EXPANDER_PIN_NUM_2/);
  assert.match(expander, /esp_io_expander_set_level\(expander_handle, IO_EXPANDER_PIN_NUM_2, 1\)/);
  assert.ok(appMain.indexOf('io_expander_init();') < appMain.indexOf('esp_es8311_port_init(i2c_bus_handle);'));
});

test('MINI keeps Waveshare factory I2S bring-up clock before codec 48 kHz open', async () => {
  const codec = await readFile(new URL('../firmware/waveshare-terminal/vendor/esp_es8311_port.cpp', import.meta.url), 'utf8');
  assert.match(codec, /I2S_STD_CLK_DEFAULT_CONFIG\(16000\)/);
  assert.match(codec, /fs\.sample_rate = 48000/);
});
