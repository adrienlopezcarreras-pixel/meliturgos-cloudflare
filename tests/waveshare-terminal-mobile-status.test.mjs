import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
// Fresh-head guard: run this contract against the current PR merge ref.

test('MINI 0.4.29 reports the real mobile link independently from Wi-Fi', async () => {
  const [runtime, main, header, workflow] = await Promise.all([
    readFile(new URL('firmware/waveshare-terminal/main/mel_terminal.cpp', root), 'utf8'),
    readFile(new URL('firmware/waveshare-terminal/main/main.cpp', root), 'utf8'),
    readFile(new URL('firmware/waveshare-terminal/main/mel_terminal.h', root), 'utf8'),
    readFile(new URL('.github/workflows/waveshare-terminal-firmware.yml', root), 'utf8'),
  ]);

  assert.match(header, /MEL_FW_VERSION "0\.4\.29-online-camera-noise"/);
  assert.match(workflow, /"version": "0\.4\.29-online-camera-noise"/);

  assert.match(runtime, /void mel_terminal_set_mobile_connected\(bool connected\)/);
  assert.match(runtime, /ui_status\(g_online \? "MEL MOBILE CONNECTE" : "MOBILE CONNECTE"\)/);
  assert.match(runtime, /bool mel_terminal_mobile_connected\(void\)/);
  assert.match(runtime, /return g_mobile_connected && mel_mobile_bridge_ready\(\)/);
  assert.match(runtime, /g_online = true;[\s\S]*ui_status\(mel_terminal_mobile_connected\(\) \? "MEL MOBILE CONNECTE" : ""\)/);

  assert.match(main, /Mobile: %s/);
  assert.match(main, /mel_terminal_mobile_connected\(\) \? "CONNECTE" : "OFF"/);

  // A mobile disconnect while Wi-Fi is still associated must clear the stale
  // mobile label instead of leaving MINI falsely shown as connected.
  assert.match(runtime, /else \{\s*ui_status\(g_online \? "" : "WI-FI CONNECTE"\);\s*\}/);
});


test('BLE relay keeps pull fallback active after notifications', async () => {
  const bridge = await readFile(
    new URL('../firmware/waveshare-terminal/main/mel_mobile_bridge.cpp', import.meta.url),
    'utf8'
  );
  assert.doesNotMatch(bridge, /bool push_mode/);
  assert.match(bridge, /last_pull/);
  assert.match(bridge, /pull_response_frame\(\)/);
  assert.match(bridge, /timed out; recycling BLE link/);
});

test('Camera capture is serialized and boot no longer consumes a frame', async () => {
  const main = await readFile(
    new URL('../firmware/waveshare-terminal/main/main.cpp', import.meta.url),
    'utf8'
  );
  const start = main.indexOf('static bool camera_probe_once');
  const end = main.indexOf('static const char *wifi_reason_text', start);
  const probe = main.slice(start, end);
  assert.doesNotMatch(probe, /esp_camera_fb_get\(\)/);
  assert.match(main, /camera_test_mutex/);
  assert.match(main, /xSemaphoreTake\(camera_test_mutex/);
  assert.match(main, /xSemaphoreGive\(camera_test_mutex/);
});


test('MINI camera test no longer disconnects Wi-Fi or reinitializes the driver', async () => {
  const main = await readFile(
    new URL('../firmware/waveshare-terminal/main/main.cpp', import.meta.url),
    'utf8'
  );
  const start = main.indexOf('static void settings_camera_test_task');
  const end = main.indexOf('static void settings_camera_clicked', start);
  const task = main.slice(start, end);
  assert.doesNotMatch(task, /esp_wifi_disconnect\(\)/);
  assert.doesNotMatch(task, /esp_camera_deinit\(\)/);
  assert.doesNotMatch(task, /esp_camera_port_init\(/);
  assert.match(task, /esp_camera_sensor_get\(\)/);
  assert.match(task, /esp_camera_fb_get\(\)/);
  assert.match(task, /attente trame \(max 4 s\)/);
  assert.match(main, /camera_task_ok != pdPASS/);
});

test('MINI restarts MEL online validation on every physical BLE reconnect', async () => {
  const main = await readFile(
    new URL('../firmware/waveshare-terminal/main/main.cpp', import.meta.url),
    'utf8'
  );
  assert.match(main, /if \(!physical_ready\)[\s\S]*mel_terminal_set_mobile_connected\(true\);[\s\S]*mel_terminal_start_online\(\);/);
  assert.match(main, /online validation restarted/);
});


test('MINI rejects zero-byte camera frames and renders a real preview', async () => {
  const main = await readFile(
    new URL('../firmware/waveshare-terminal/main/main.cpp', import.meta.url),
    'utf8'
  );
  const start = main.indexOf('static void settings_camera_test_task');
  const end = main.indexOf('static void settings_camera_clicked', start);
  const task = main.slice(start, end);
  assert.doesNotMatch(task, /esp_camera_return_all\(\)/);
  assert.match(task, /fb->len == expected/);
  assert.match(task, /fb->len != expected/);
  assert.match(task, /warm-up frame/);
  assert.match(task, /settings_camera_show_preview\(fb\)/);
  assert.match(main, /lv_img_set_src\(settings_camera_preview/);
  assert.match(main, /visuel OK/);
});
