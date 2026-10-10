import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = path => readFile(new URL(path, root), 'utf8');

test('MINI Link V2 rejects unencrypted control and bulk GATT writes', async () => {
  const server = await read('firmware/waveshare-terminal/main/mel_link_v2_server.cpp');
  assert.match(server, /BLE_GATT_CHR_F_WRITE \| BLE_GATT_CHR_F_WRITE_ENC/);
  assert.match(server, /BLE_GATT_CHR_F_WRITE \| BLE_GATT_CHR_F_WRITE_NO_RSP \| BLE_GATT_CHR_F_WRITE_ENC/);
  assert.match(server, /ble_hs_cfg\.sm_bonding = 1/);
  assert.match(server, /ble_hs_cfg\.sm_sc = 1/);
  assert.match(server, /BLE_GAP_EVENT_ENC_CHANGE/);
  assert.match(server, /g_link_encrypted\.load\(\) &&/);
  assert.match(server, /const bool now_ready = g_event_subscribed && g_link_encrypted\.load\(\)/);
});

test('MINI refuses invalid SESSION clock and sessionless media channel credentials', async () => {
  const transport = await read('firmware/waveshare-terminal/main/mel_link_v2_transport.cpp');
  assert.match(transport, /if \(!clock_ok \|\| !mel_link_v2_server_ready\(\)\)/);
  assert.match(transport, /g_session_ready\.store\(false\)/);
  assert.match(transport, /if \(!g_session_ready\.load\(\) \|\| !mel_link_v2_server_ready\(\)\)/);
  assert.match(transport, /MEDIA_CONFIG rejected: Android V2 session not verified/);
});

test('Android requests system BLE pairing before MTU, not an advertising GATT server', async () => {
  const service = await read('android-companion/app/src/main/java/fr/veriteinterdite/mel/MelLinkV2ClientService.kt');
  const activity = await read('android-companion/app/src/main/java/fr/veriteinterdite/mel/MainActivity.kt');
  const manifest = await read('android-companion/app/src/main/AndroidManifest.xml');
  assert.match(service, /BluetoothDevice\.ACTION_BOND_STATE_CHANGED/);
  assert.match(service, /BluetoothDevice\.BOND_BONDED -> beginMtuNegotiation\(client\)/);
  assert.match(service, /client\.device\.createBond\(\)/);
  assert.match(activity, /Manifest\.permission\.BLUETOOTH_SCAN/);
  assert.match(activity, /Intent\(this, MelLinkV2ClientService::class\.java\)/);
  assert.doesNotMatch(activity, /Intent\(this, MelBleBridgeService::class\.java\)/);
  assert.match(manifest, /android\.permission\.BLUETOOTH_SCAN/);
  assert.match(manifest, /android:name="\.MelBleBridgeService"\s+android:enabled="false"/);
});

test('scheduled Companion relay cannot flash or reset a MINI', async () => {
  const api = await read('src/devices/computer-companion-api.js');
  const relay = await read('scripts/cloudflare-api-relay-runner.mjs');
  const workflow = await read('.github/workflows/cloudflare-api-relay.yml');
  const updater = await read('.github/workflows/mini-windows-updater.yml');
  assert.doesNotMatch(api.split('const PC_CONTROL_PROOF_ACTIONS=new Set(')[1]?.split(';')[0] || '', /serial\.hard_reset/);
  assert.doesNotMatch(relay, /action:'serial\.hard_reset'/);
  assert.doesNotMatch(workflow, /MEL_MINI_RESET_APPROVED/);
  assert.match(updater, /legacy_approval/);
  assert.doesNotMatch(updater, /\n  push:\s*\n/);
  assert.match(updater, /BUILD_LEGACY_0_4_37/);
});
