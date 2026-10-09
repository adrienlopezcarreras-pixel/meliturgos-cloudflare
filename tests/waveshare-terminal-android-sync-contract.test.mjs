import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('MINI recovery keeps the canonical MEL avatar and second-press voice stop', async () => {
  const [canonical, android, main, runtime] = await Promise.all([
    readFile(new URL('../dist/assets/avatars/mel-full.webp', import.meta.url)),
    readFile(new URL('../android-companion/app/src/main/res/drawable-nodpi/mel_futuristic_new.webp', import.meta.url)),
    readFile(new URL('../firmware/waveshare-terminal/main/main.cpp', import.meta.url), 'utf8'),
    readFile(new URL('../firmware/waveshare-terminal/main/mel_terminal.cpp', import.meta.url), 'utf8'),
  ]);
  assert.equal(Buffer.compare(canonical, android), 0);
  assert.match(main, /lv_img_set_src\(avatar_obj,\s*&mel_avatar_mode_complet\)/);
  assert.match(runtime, /g_voice_stop_requested = true/);
  assert.match(runtime, /VOICE STOP requested by second press/);
});

test('MINI recovery uses Link V2 peripheral/server instead of the legacy central bridge', async () => {
  const [cmake, server, workflow] = await Promise.all([
    readFile(new URL('../firmware/waveshare-terminal/main/CMakeLists.txt', import.meta.url), 'utf8'),
    readFile(new URL('../firmware/waveshare-terminal/main/mel_link_v2_server.cpp', import.meta.url), 'utf8'),
    readFile(new URL('../.github/workflows/waveshare-terminal-firmware.yml', import.meta.url), 'utf8'),
  ]);
  assert.match(cmake, /mel_mobile_bridge_v2\.cpp/);
  assert.match(cmake, /mel_link_v2_protocol\.cpp/);
  assert.match(cmake, /mel_link_v2_server\.cpp/);
  assert.match(cmake, /mel_link_v2_transport\.cpp/);
  assert.doesNotMatch(cmake, /"mel_mobile_bridge\.cpp"/);
  assert.match(server, /BLE_GATT_SVC_TYPE_PRIMARY/);
  assert.match(server, /ble_gap_adv_start/);
  assert.doesNotMatch(server, /ble_gap_disc\(/);
  assert.match(workflow, /set_cfg_n CONFIG_BT_NIMBLE_ROLE_CENTRAL/);
  assert.match(workflow, /set_cfg_y CONFIG_BT_NIMBLE_ROLE_PERIPHERAL/);
  assert.match(workflow, /set_cfg_n CONFIG_BT_NIMBLE_GATT_CLIENT/);
  assert.match(workflow, /set_cfg_y CONFIG_BT_NIMBLE_GATT_SERVER/);
});

test('MINI recovery keeps 48 kHz ES8311 playback and 16 kHz STT decimation', async () => {
  const [runtime, transport] = await Promise.all([
    readFile(new URL('../firmware/waveshare-terminal/main/mel_terminal.cpp', import.meta.url), 'utf8'),
    readFile(new URL('../firmware/waveshare-terminal/main/mel_link_v2_transport.cpp', import.meta.url), 'utf8'),
  ]);
  assert.match(runtime, /VOICE_CAPTURE_RATE = 48000/);
  assert.match(runtime, /VOICE_STT_RATE = 16000/);
  assert.match(runtime, /decimate_48k_to_16k/);
  assert.match(runtime, /sample_rate != 48000/);
  assert.match(runtime, /bits_per_sample != 16/);
  assert.match(transport, /MEL_LINK_V2_AUDIO_BEGIN/);
  assert.match(transport, /MEL_LINK_V2_AUDIO_DATA/);
  assert.match(transport, /MEL_LINK_V2_AUDIO_END/);
});

test('MINI recovery keeps hardware diagnostics, camera bring-up and Wi-Fi fallback', async () => {
  const [main, workflow] = await Promise.all([
    readFile(new URL('../firmware/waveshare-terminal/main/main.cpp', import.meta.url), 'utf8'),
    readFile(new URL('../.github/workflows/waveshare-terminal-firmware.yml', import.meta.url), 'utf8'),
  ]);
  assert.match(main, /STEP 4\.5: CAMERA DVP EARLY/);
  assert.match(main, /camera_probe_once\("EARLY"\)/);
  assert.match(main, /sensor->id\.PID == OV5640_PID \|\| sensor->id\.PID == OV2640_PID/);
  assert.match(main, /"TEST MICRO \+ HP"/);
  assert.match(main, /"TEST CAMERA"/);
  assert.match(main, /"TEST VOIX \/ STT"/);
  assert.match(main, /TRANSPORT PRIORITY: MEL Mobile first/);
  assert.match(workflow, /set_cfg_y CONFIG_OV5640_SUPPORT/);
  assert.match(workflow, /set_cfg_y CONFIG_OV2640_SUPPORT/);
  assert.match(workflow, /set_cfg_y CONFIG_SCCB_HARDWARE_I2C_PORT0/);
  assert.match(workflow, /set_cfg_n CONFIG_SCCB_HARDWARE_I2C_PORT1/);
});
