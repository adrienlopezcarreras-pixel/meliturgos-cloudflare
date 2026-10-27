import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('MINI reserves BLE Link V2 receiver in external PSRAM ahead of Wi-Fi startup', async () => {
  const src = await read('../firmware/waveshare-terminal/main/mel_link_v2_server.cpp');
  const config = await read('../firmware/waveshare-terminal/sdkconfig.defaults');
  assert.match(config, /^CONFIG_SPIRAM=y$/m);
  assert.match(config, /^CONFIG_FREERTOS_TASK_CREATE_ALLOW_EXT_MEM=y$/m);
  assert.match(src, /xQueueCreateWithCaps\([\s\S]*?MALLOC_CAP_SPIRAM \| MALLOC_CAP_8BIT\s*\)/);
  assert.match(src, /xTaskCreateWithCaps\([\s\S]*?MALLOC_CAP_SPIRAM \| MALLOC_CAP_8BIT\s*\)/);
  assert.match(src, /vQueueDeleteWithCaps\(g_rx_queue\)/);
  assert.doesNotMatch(src, /g_rx_queue\s*=\s*xQueueCreate\(/);
  assert.match(src, /LINK RX PSRAM RESERVED/);
});

test('MINI can boot its authenticated BLE transport if optional Wi-Fi lacks memory', async () => {
  const src = await read('../firmware/waveshare-terminal/main/main.cpp');
  const init = src.indexOf('const esp_err_t wifi_start_result = mini_wifi_stack_init();');
  const ble = src.indexOf('mel_mobile_bridge_start();', init - 1100);
  assert.ok(init > 0 && ble >= 0 && ble < init, 'BLE should start before Wi-Fi fallback');
  assert.doesNotMatch(src, /ESP_ERROR_CHECK\(mini_wifi_stack_init\(\)\)/);
  assert.match(src, /wifi_stack_ready = wifi_start_result == ESP_OK/);
  assert.match(src, /WIFI FALLBACK UNAVAILABLE/);
  assert.match(src, /if \(wifi_stack_ready && !wifi_got_ip && !wifi_connect_task_handle && !wifi_fallback_task_handle\)/);
  assert.match(src, /if \(wifi_start_result == ESP_OK\)\s*\{[\s\S]*?wifi_fallback_after_ble_task/);
});
