import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('MINI and Android keep the same canonical MEL avatar', async () => {
  const [canonical, android, miniUi] = await Promise.all([
    readFile(new URL('../dist/assets/avatars/mel-full.webp', import.meta.url)),
    readFile(new URL('../android-companion/app/src/main/res/drawable-nodpi/mel_futuristic_new.webp', import.meta.url)),
    readFile(new URL('../firmware/waveshare-terminal/main/main.cpp', import.meta.url), 'utf8'),
  ]);

  assert.equal(Buffer.compare(canonical, android), 0, 'Android avatar must stay byte-identical to mel-full.webp');
  assert.match(miniUi, /lv_img_set_src\(avatar_obj,\s*&mel_avatar_mode_complet\)/);
});

test('MINI second voice action stops and finalizes an active recording', async () => {
  const source = await readFile(
    new URL('../firmware/waveshare-terminal/main/mel_terminal.cpp', import.meta.url),
    'utf8'
  );

  assert.match(
    source,
    /if \(g_voice_task_handle\) \{[\s\S]*?g_runtime_state == MEL_TERMINAL_LISTENING[\s\S]*?g_voice_stop_requested = true;[\s\S]*?VOICE STOP requested by second press/
  );
});

test('MINI TTS transport is 16 kHz while playback remains PCM 16-bit mono at 48 kHz', async () => {
  const [runtime, apiTests] = await Promise.all([
    readFile(new URL('../firmware/waveshare-terminal/main/mel_terminal.cpp', import.meta.url), 'utf8'),
    readFile(new URL('./waveshare-terminal-api.test.mjs', import.meta.url), 'utf8'),
  ]);

  assert.match(runtime, /channels != 1/);
  assert.match(runtime, /sample_rate != 48000/);
  assert.match(runtime, /bits_per_sample != 16/);
  assert.match(apiTests, /@cf\/deepgram\/aura-1/);
  assert.match(apiTests, /speaker:'luna'/);
  assert.match(apiTests, /sample_rate:16000/);
});

test('MINI and Android BLE bridge UUIDs stay aligned', async () => {
  const [mini, android] = await Promise.all([
    readFile(new URL('../firmware/waveshare-terminal/main/mel_mobile_bridge.cpp', import.meta.url), 'utf8'),
    readFile(new URL('../android-companion/app/src/main/java/fr/veriteinterdite/mel/MelBleBridgeService.kt', import.meta.url), 'utf8'),
  ]);

  assert.match(mini, /MEL_BRIDGE_SERVICE = 0xABF0/);
  assert.match(mini, /MEL_BRIDGE_RX = 0xABF1/);
  assert.match(mini, /MEL_BRIDGE_TX = 0xABF2/);

  assert.match(android, /0000abf0-0000-1000-8000-00805f9b34fb/);
  assert.match(android, /0000abf1-0000-1000-8000-00805f9b34fb/);
  assert.match(android, /0000abf2-0000-1000-8000-00805f9b34fb/);

  assert.doesNotMatch(mini, /7d4b000[123]/i);
  assert.doesNotMatch(android, /7d4b000[123]/i);
});


test('MINI prioritizes MEL Mobile before automatic Wi-Fi fallback', async () => {
  const [main, bridge, runtime] = await Promise.all([
    readFile(new URL('../firmware/waveshare-terminal/main/main.cpp', import.meta.url), 'utf8'),
    readFile(new URL('../firmware/waveshare-terminal/main/mel_mobile_bridge.cpp', import.meta.url), 'utf8'),
    readFile(new URL('../firmware/waveshare-terminal/main/mel_terminal.cpp', import.meta.url), 'utf8'),
  ]);

  assert.match(main, /MEL MOBILE BLE START \(PRIMARY\)/);
  assert.doesNotMatch(main, /while \(!camera_probe_done\)/);
  assert.match(main, /TRANSPORT PRIORITY: MEL Mobile first/);
  assert.match(main, /mel_mobile_bridge_candidate_seen\(\)/);
  assert.match(main, /MEL Mobile unavailable; starting saved Wi-Fi fallback/);

  assert.match(bridge, /params\.passive = 0/);
  assert.match(bridge, /g_candidate_seen\.store\(true\)/);
  assert.match(bridge, /bool mel_mobile_bridge_candidate_seen\(void\)/);

  const mobileFirst = runtime.indexOf('if (mel_mobile_bridge_ready())');
  const wifiGuard = runtime.indexOf('if (!g_wifi_connected) return ESP_ERR_INVALID_STATE');
  assert.ok(mobileFirst >= 0 && wifiGuard > mobileFirst, 'MEL Mobile must be evaluated before direct Wi-Fi');
});


test('MINI settings exposes hardware diagnostics after transport setup', async () => {
  const main = await readFile(
    new URL('../firmware/waveshare-terminal/main/main.cpp', import.meta.url),
    'utf8'
  );
  assert.match(main, /"TEST MICRO \+ HP"/);
  assert.match(main, /"TEST CAMERA"/);
  assert.match(main, /"TEST VOIX \/ STT"/);
  assert.match(main, /settings_audio_clicked/);
  assert.match(main, /settings_camera_clicked/);
  assert.match(main, /settings_stt_clicked/);
});


test('MINI hardware fix validates camera variants, audible loopback, and Wi-Fi recovery', async () => {
  const [main, workflow] = await Promise.all([
    readFile(new URL('../firmware/waveshare-terminal/main/main.cpp', import.meta.url), 'utf8'),
    readFile(new URL('../.github/workflows/waveshare-terminal-firmware.yml', import.meta.url), 'utf8'),
  ]);

  assert.match(workflow, /set_cfg_y CONFIG_OV5640_SUPPORT/);
  assert.match(workflow, /set_cfg_y CONFIG_OV2640_SUPPORT/);
  assert.match(workflow, /camera_config_t config = \{\};/);
  assert.match(workflow, /config\.sccb_i2c_port = i2c_port/);

  assert.match(main, /sensor->id\.PID == OV5640_PID \|\| sensor->id\.PID == OV2640_PID/);
  assert.match(main, /MIC : parle pendant 2 secondes/);
  assert.match(main, /HP : lecture de ta voix pendant 2 secondes/);
  assert.match(main, /esp_codec_dev_write\(output_dev, pcm, byte_count\)/);
  assert.match(main, /No MEL Mobile candidate and no saved Wi-Fi; opening Wi-Fi setup/);
  assert.match(main, /MEL Mobile present but session offline; keeping UI and retrying BLE auth/);
  assert.match(main, /request_view\(MINI_VIEW_WIFI_LIST\)/);
  assert.match(main, /MINI WIFI CONNECT START FAILED/);
});


test('MINI accepts Android Bluetooth-base UUIDs encoded as 128-bit GATT UUIDs', async () => {
  const bridge = await readFile(
    new URL('../firmware/waveshare-terminal/main/mel_mobile_bridge.cpp', import.meta.url),
    'utf8'
  );
  assert.match(bridge, /UUID_SERVICE_128/);
  assert.match(bridge, /UUID_RX_128/);
  assert.match(bridge, /UUID_TX_128/);
  assert.match(bridge, /uuid_matches_mel/);
  assert.match(bridge, /peer_disc_all\(conn_handle, on_discovery_complete/);
  assert.match(bridge, /NimBLE ble_uuid_cmp\(\) is type-strict/);
});


test('MINI requires authenticated MEL online before cancelling Wi-Fi recovery', async () => {
  const main = await readFile(
    new URL('../firmware/waveshare-terminal/main/main.cpp', import.meta.url),
    'utf8'
  );
  assert.match(main, /if \(mel_terminal_online\(\)\)/);
  assert.match(main, /MEL Mobile BLE connected but MEL session is still offline; enabling Wi-Fi recovery/);
  assert.match(main, /mel_terminal_start_online\(\);/);
  assert.match(main, /mini_wifi_event_diag[\s\S]*mel_terminal_start_online\(\);/);
});

test('MINI camera follows Waveshare early bring-up and shared SCCB I2C0', async () => {
  const [main, workflow] = await Promise.all([
    readFile(new URL('../firmware/waveshare-terminal/main/main.cpp', import.meta.url), 'utf8'),
    readFile(new URL('../.github/workflows/waveshare-terminal-firmware.yml', import.meta.url), 'utf8'),
  ]);
  assert.match(main, /STEP 4\.5: CAMERA DVP EARLY/);
  assert.match(main, /camera_probe_once\("EARLY"\)/);
  assert.match(main, /SCCB probe 0x3c=%s 0x30=%s/);
  assert.match(workflow, /set_cfg_y CONFIG_SCCB_HARDWARE_I2C_PORT0/);
  assert.match(workflow, /set_cfg_n CONFIG_SCCB_HARDWARE_I2C_PORT1/);
});
