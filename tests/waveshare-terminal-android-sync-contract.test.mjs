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
    /if \(g_voice_job_active\) \{[\s\S]*?g_runtime_state == MEL_TERMINAL_LISTENING[\s\S]*?g_voice_stop_requested = true;[\s\S]*?VOICE STOP requested by second press/
  );
});

test('MINI TTS playback contract matches Waveshare physical PCM 16-bit mono at 48 kHz', async () => {
  const [runtime, apiTests] = await Promise.all([
    readFile(new URL('../firmware/waveshare-terminal/main/mel_terminal.cpp', import.meta.url), 'utf8'),
    readFile(new URL('./waveshare-terminal-api.test.mjs', import.meta.url), 'utf8'),
  ]);

  assert.match(runtime, /channels != 1/);
  assert.match(runtime, /sample_rate != 48000/);
  assert.match(runtime, /bits_per_sample != 16/);
  assert.match(apiTests, /@cf\/deepgram\/aura-1/);
  assert.match(apiTests, /speaker:'luna'/);
  assert.match(apiTests, /sample_rate:48000/);
});

test('MINI and Android Link V2 UUIDs and roles stay aligned', async () => {
  const [server, transport, android, cmake] = await Promise.all([
    readFile(new URL('../firmware/waveshare-terminal/main/mel_link_v2_server.cpp', import.meta.url), 'utf8'),
    readFile(new URL('../firmware/waveshare-terminal/main/mel_link_v2_transport.cpp', import.meta.url), 'utf8'),
    readFile(new URL('../android-companion/app/src/main/java/fr/veriteinterdite/mel/MelLinkV2ClientService.kt', import.meta.url), 'utf8'),
    readFile(new URL('../firmware/waveshare-terminal/main/CMakeLists.txt', import.meta.url), 'utf8'),
  ]);

  assert.match(server, /UUID_SERVICE = BLE_UUID16_INIT\(0xabf0\)/);
  assert.match(server, /UUID_CONTROL_RX = BLE_UUID16_INIT\(0xabf1\)/);
  assert.match(server, /UUID_EVENT_TX = BLE_UUID16_INIT\(0xabf2\)/);
  assert.match(server, /UUID_BULK_RX = BLE_UUID16_INIT\(0xabf3\)/);

  assert.match(android, /0000abf0-0000-1000-8000-00805f9b34fb/);
  assert.match(android, /0000abf1-0000-1000-8000-00805f9b34fb/);
  assert.match(android, /0000abf2-0000-1000-8000-00805f9b34fb/);
  assert.match(android, /0000abf3-0000-1000-8000-00805f9b34fb/);

  assert.match(server, /ble_gap_adv_start/);
  assert.doesNotMatch(server, /ble_gap_disc\(/);
  assert.match(android, /ScanFilter\.Builder\(\)\.setServiceUuid/);
  assert.match(android, /connectGatt\(/);
  assert.doesNotMatch(android, /BluetoothGattServer/);
  assert.doesNotMatch(android, /AdvertiseCallback/);

  assert.match(cmake,/mel_mobile_bridge_v2\.cpp/);
  assert.doesNotMatch(cmake,/"mel_mobile_bridge\.cpp"/);
  assert.doesNotMatch(cmake,/nimble_peer\.c/);
  assert.match(transport,/MEL_LINK_V2_CREDIT/);
  assert.match(transport,/Response sequence gap/);
});


test('MINI keeps Link V2 primary before automatic Wi-Fi fallback', async () => {
  const [main, adapter, runtime] = await Promise.all([
    readFile(new URL('../firmware/waveshare-terminal/main/main.cpp', import.meta.url), 'utf8'),
    readFile(new URL('../firmware/waveshare-terminal/main/mel_mobile_bridge_v2.cpp', import.meta.url), 'utf8'),
    readFile(new URL('../firmware/waveshare-terminal/main/mel_terminal.cpp', import.meta.url), 'utf8'),
  ]);

  assert.match(main, /TRANSPORT PRIORITY: MEL Mobile first/);
  assert.match(main, /mel_mobile_bridge_candidate_seen\(\)/);
  assert.match(adapter, /mel_link_v2_transport_ready\(\)/);
  assert.match(adapter, /mel_link_v2_transport_candidate_seen\(\)/);
  assert.match(adapter, /\(void\)token; \/\/ V2 never forwards the MINI bearer to Android/);

  const mobileFirst = runtime.indexOf('if (mel_mobile_bridge_ready())');
  const wifiGuard = runtime.indexOf('if (!g_wifi_connected) return ESP_ERR_INVALID_STATE');
  assert.ok(mobileFirst >= 0 && wifiGuard > mobileFirst, 'Link V2 must be evaluated before direct Wi-Fi');
});


test('MINI settings exposes hardware diagnostics after transport setup', async () => {
  const main = await readFile(
    new URL('../firmware/waveshare-terminal/main/main.cpp', import.meta.url),
    'utf8'
  );
  assert.match(main, /"TEST MICRO \+ HP"/);
  assert.match(main, /"TEST CAMERA"/);
  assert.match(main, /"CHAT MEL"/);
  assert.match(main, /settings_audio_clicked/);
  assert.match(main, /settings_camera_clicked/);
  assert.match(main, /settings_chat_clicked/);
  assert.match(main, /"VOIX : ON"/);\n  assert.match(main, /"VOIX : OFF"/);
  assert.match(main, /mel_terminal_stop_voice_output\(\)/);
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


test('MINI Link V2 owns one stable peripheral GATT database and never scans for Android', async () => {
  const [server, workflow] = await Promise.all([
    readFile(new URL('../firmware/waveshare-terminal/main/mel_link_v2_server.cpp', import.meta.url), 'utf8'),
    readFile(new URL('../.github/workflows/waveshare-terminal-firmware.yml', import.meta.url), 'utf8'),
  ]);
  assert.match(server,/BLE_GATT_SVC_TYPE_PRIMARY/);
  assert.match(server,/BLE_GATT_CHR_F_WRITE/);
  assert.match(server,/BLE_GATT_CHR_F_NOTIFY \| BLE_GATT_CHR_F_INDICATE/);
  assert.match(server,/BLE_GATT_CHR_F_WRITE_NO_RSP/);
  assert.match(server,/ble_gap_adv_start/);
  assert.doesNotMatch(server,/ble_gap_disc\(/);
  assert.doesNotMatch(server,/peer_disc_all/);
  assert.match(workflow,/set_cfg_n CONFIG_BT_NIMBLE_ROLE_CENTRAL/);
  assert.match(workflow,/set_cfg_y CONFIG_BT_NIMBLE_ROLE_PERIPHERAL/);
  assert.match(workflow,/set_cfg_n CONFIG_BT_NIMBLE_GATT_CLIENT/);
  assert.match(workflow,/set_cfg_y CONFIG_BT_NIMBLE_GATT_SERVER/);
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
