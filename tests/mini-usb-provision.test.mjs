import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { maybeHandleComputerApi } from '../src/devices/computer-companion-api.js';
import { miniBlePairCommand } from '../src/devices/mini-usb-provision.js';
import { sqliteD1 } from './helpers/sqlite-d1.mjs';

const ownerAuth = 'Basic ' + Buffer.from('adrien:test').toString('base64');
const request = (path, method = 'GET', body = null, authenticated = true) => new Request('https://mel.test' + path, {
  method,
  headers: { ...(authenticated ? { authorization: ownerAuth } : {}), ...(body ? { 'content-type': 'application/json' } : {}) },
  ...(body ? { body: JSON.stringify(body) } : {}),
});

test('BLE pair command relays the MINI passkey from USB into the phone over adb, without Wi-Fi', () => {
  const { command, timeout_ms } = miniBlePairCommand();
  assert.equal(timeout_ms, 120000);
  assert.ok(command.length <= 8192);
  assert.match(command, /MELBLE PASSKEY \(\\d\{6\}\)/);
  assert.match(command, /'cmd','bluetooth_manager','enable'/);
  assert.match(command, /'input','text',\$pk/);
  assert.match(command, /VID_303A&PID_1001/);
  assert.match(command, /\$sp\.DtrEnable=\$false;\$sp\.RtsEnable=\$false/, 'opening the port must not reset the MINI');
  assert.doesNotMatch(command, /netsh|wlan|dl\.google|Expand-Archive/);
});

test('mini.ble.pair is owner-only and queues the fixed command', async () => {
  const DB = sqliteD1();
  const env = { DB, MELITURGOS_USER: 'adrien', MELITURGOS_PASSWORD: 'test' };
  assert.equal((await maybeHandleComputerApi(request('/api/computer/v1/status'), env)).status, 200);
  await DB.prepare('INSERT INTO computer_devices(id,token_hash,name,platform,capabilities,allowed_apps,halted,created_at,last_seen_at,metadata) VALUES(?,?,?,?,?,?,?,?,?,?)')
    .bind('pc-1', 'h', 'PC', 'windows', JSON.stringify(['computer.use']), JSON.stringify([]), 0, Date.now(), Date.now(), JSON.stringify({ remote_access_enabled: true })).run();
  const call = (auth = true) => maybeHandleComputerApi(request('/api/computer/v1/pc-control', 'POST', { computer_id: 'pc-1', action: 'mini.ble.pair', payload: { command: 'Write-Host INJECTED' } }, auth), env);
  assert.equal((await call(false)).status, 401);
  assert.equal((await call()).status, 202);
  const step = JSON.parse((await DB.prepare('SELECT plan_json FROM computer_commands').first()).plan_json).steps[0];
  assert.equal(step.action, 'system.exec');
  assert.equal(step.payload.command, miniBlePairCommand().command);
});

test('firmware announces the Bluetooth passkey on USB for a MINI without a usable screen', async () => {
  const src = await readFile(new URL('../firmware/waveshare-terminal/main/mel_terminal.cpp', import.meta.url), 'utf8');
  const fn = src.slice(src.indexOf('static void usb_passkey_task'), src.indexOf('void mel_terminal_start_usb_passkey_relay'));
  assert.match(fn, /mel_link_v2_server_pairing_passkey\(&passkey\)/);
  assert.match(fn, /MELBLE PASSKEY %06lu/);
  assert.doesNotMatch(src, /MELPROV|save_string\("wifi_pass", (ssid|pass)->/);
  const main = await readFile(new URL('../firmware/waveshare-terminal/main/main.cpp', import.meta.url), 'utf8');
  assert.match(main, /mel_terminal_start_usb_passkey_relay\(\);/);
});
