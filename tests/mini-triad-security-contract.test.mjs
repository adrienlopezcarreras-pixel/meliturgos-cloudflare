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
  assert.match(server, /ble_hs_cfg\.sm_mitm = 1/);
  assert.match(server, /ble_hs_cfg\.sm_io_cap = BLE_SM_IO_CAP_DISP_ONLY/);
  assert.match(server, /BLE_GAP_EVENT_PASSKEY_ACTION/);
  assert.match(server, /BLE_SM_IOACT_DISP/);
  assert.match(server, /esp_random\(\) % 1000000U/);
  assert.match(server, /ble_sm_inject_io\(event->passkey\.conn_handle, &io\)/);
  assert.match(server, /desc\.sec_state\.authenticated/);
  assert.match(server, /desc\.sec_state\.bonded/);
  assert.match(server, /const bool secure = encrypted && authenticated && bonded/);
  assert.doesNotMatch(server, /ESP_LOG[IDWE]\([^;]*passkey[^;]*%0?6[luud]/i,
    'numeric pairing passkeys must never be emitted to logs');
  assert.match(server, /ble_gap_security_initiate\(g_conn\)/);
  assert.match(server, /ble_store_config_init\(\)/);
  assert.match(server, /extern "C" void ble_store_config_init\(void\);/);
  assert.match(server, /ble_hs_cfg\.store_status_cb = ble_store_util_status_rr/);
  assert.match(server, /ble_gap_terminate\(g_conn, BLE_ERR_REM_USER_CONN_TERM\)/);
  const workflow = await read('.github/workflows/waveshare-terminal-firmware.yml');
  assert.match(workflow, /set_cfg_y CONFIG_BT_NIMBLE_NVS_PERSIST/);
  assert.match(workflow, /set_cfg_int CONFIG_BT_NIMBLE_SM_SC_ONLY 1/);
  const defaults = await read('firmware/waveshare-terminal/sdkconfig.defaults');
  assert.match(defaults, /CONFIG_BT_NIMBLE_NVS_PERSIST=y/);
  assert.match(defaults, /CONFIG_BT_NIMBLE_SM_SC_ONLY=1/);

  assert.match(server, /BLE_GAP_EVENT_ENC_CHANGE/);
  assert.match(server, /g_link_encrypted\.load\(\) &&/);
  assert.match(server, /const bool now_ready = g_event_subscribed && g_link_encrypted\.load\(\)/);
});

test('MINI enforces an ephemeral MITM passkey without replacing MEL account pairing', async () => {
  const [server, header, ui, firmwareHeader, readme] = await Promise.all([
    read('firmware/waveshare-terminal/main/mel_link_v2_server.cpp'),
    read('firmware/waveshare-terminal/main/mel_link_v2_server.h'),
    read('firmware/waveshare-terminal/main/main.cpp'),
    read('firmware/waveshare-terminal/main/mel_terminal.h'),
    read('firmware/waveshare-terminal/README.md'),
  ]);
  assert.match(header, /mel_link_v2_server_pairing_passkey\(uint32_t \*passkey_out\)/);
  assert.match(server, /g_pairing_passkey_visible\.store\(true\)/);
  assert.match(server, /g_pairing_passkey_visible\.store\(false\)/);
  assert.match(server, /bool mel_link_v2_server_pairing_passkey\(uint32_t \*passkey_out\)/);
  assert.match(ui, /#include "mel_link_v2_server\.h"/);
  assert.match(ui, /pairing_passkey_label = lv_label_create\(screen\)/);
  assert.ok(ui.includes('APPARIEMENT BLE SECURISE\\nCode a saisir sur Android : %06lu'));
  assert.match(ui, /mel_link_v2_server_pairing_passkey\(&passkey\)/);
  assert.match(ui, /lv_obj_move_foreground\(pairing_passkey_label\)/);
  assert.match(ui, /pair_ui_create\(screen\)/);
  assert.ok(ui.includes('Entre le code genere dans MEL > MINI'));
  assert.match(firmwareHeader, /MEL_FW_VERSION "0\.6\.15-secure-passkey"/);
  assert.match(readme, /0\.6\.15-secure-passkey/);
});

test('MINI refuses invalid SESSION clock and sessionless media channel credentials', async () => {
  const transport = await read('firmware/waveshare-terminal/main/mel_link_v2_transport.cpp');
  assert.match(transport, /if \(!clock_ok \|\| !mel_link_v2_server_ready\(\)\)/);
  assert.match(transport, /g_session_ready\.store\(false\)/);
  assert.match(transport, /if \(!g_session_ready\.load\(\) \|\| !mel_link_v2_server_ready\(\)\)/);
  assert.match(transport, /MEDIA_CONFIG rejected: Android V2 session not verified/);
  assert.match(transport, /header\.payload_len > 512/);
  assert.match(transport, /std::memchr\(payload, 0, header\.payload_len\) != nullptr/);
  assert.match(transport, /cJSON_ParseWithOpts\(raw\.c_str\(\), &parse_end, true\)/);
  assert.match(transport, /media channel config rejected: invalid JSON/);
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

test('Android validates discovered Link V2 GATT properties and subscribes only to supported event modes', async () => {
  const service = await read('android-companion/app/src/main/java/fr/veriteinterdite/mel/MelLinkV2ClientService.kt');
  assert.match(service, /control\.properties and BluetoothGattCharacteristic\.PROPERTY_WRITE\) == 0/);
  assert.match(service, /bulk\.properties and bulkWriteProperties\) == 0/);
  assert.match(service, /BluetoothGattCharacteristic\.PROPERTY_WRITE_NO_RESPONSE/);
  assert.match(service, /BluetoothGattCharacteristic\.PROPERTY_INDICATE/);
  assert.match(service, /BluetoothGattCharacteristic\.PROPERTY_NOTIFY/);
  assert.match(service, /indicate && notify -> byteArrayOf\(3, 0\)/);
  assert.match(service, /indicate -> byteArrayOf\(2, 0\)/);
  assert.match(service, /else -> byteArrayOf\(1, 0\)/);
  assert.match(service, /CONTROL_NOT_WRITABLE/);
  assert.match(service, /BULK_NOT_WRITABLE/);
  assert.match(service, /EVENT_NOT_SUBSCRIBABLE/);
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

test('MINI firmware boot preserves NVS on migration failure instead of auto erasing identity', async () => {
  const app = await read('firmware/waveshare-terminal/main/main.cpp');
  assert.match(app, /const esp_err_t ret = nvs_flash_init\(\)/);
  assert.match(app, /if \(ret != ESP_OK\)/);
  assert.match(app, /No automatic erase; preserve NVS for manual recovery/);
  assert.doesNotMatch(app, /nvs_flash_erase\(\)/);
});

test('MINI and Android require explicit SESSION_OK acknowledgment before reporting protocol ready', async () => {
  const mini = await read('firmware/waveshare-terminal/main/mel_link_v2_transport.cpp');
  const android = await read('android-companion/app/src/main/java/fr/veriteinterdite/mel/MelLinkV2ClientService.kt');
  assert.match(mini, /g_session_ack_pending\.store\(true\)/);
  assert.match(mini, /MEL_LINK_V2_ACK, 0, 0/);
  assert.match(mini, /kSessionAccepted\[\] = "SESSION_OK"/);
  assert.match(mini, /g_session_ack_pending\.store\(false\)/);
  assert.match(android, /MelLinkV2Protocol\.ACK ->/);
  assert.match(android, /frame\.payload\.toString\(Charsets\.UTF_8\) != "SESSION_OK"/);
  assert.match(android, /SESSION_ACK_TIMEOUT/);
  assert.match(android, /!miniReady\.value \|\| !sessionAckTimeoutArmed/);
  assert.match(android, /MINI_SESSION_NOT_READY/);
  assert.match(android, /if \(!protocolReady\.value \|\| !miniReady\.value\)/);
  assert.match(android, /if \(gatt !== sessionGatt \|\| !miniReady\.value \|\| !protocolReady\.value\) return@execute/);
  const hello = android.slice(android.indexOf('MelLinkV2Protocol.HELLO ->'), android.indexOf('MelLinkV2Protocol.ACK ->'));
  assert.match(hello, /protocolReady\.value = false/);
  assert.doesNotMatch(hello, /protocolReady\.value = true/);
  const ack = android.slice(android.indexOf('MelLinkV2Protocol.ACK ->'), android.indexOf('MelLinkV2Protocol.PING ->'));
  assert.match(ack, /protocolReady\.value = true/);
  assert.match(ack, /validateMelSession\(\)/);
});

test('Android prevents queued control frames and delayed hotspot credentials crossing BLE reconnection', async () => {
  const client = await read('android-companion/app/src/main/java/fr/veriteinterdite/mel/MelLinkV2ClientService.kt');
  assert.match(client, /val intendedGatt = gatt \?: return/);
  assert.match(client, /if \(gatt === intendedGatt\) sendControlBlocking\(frame\)/);
  assert.match(client, /val mediaRequestGatt = gatt \?: return/);
  assert.match(client, /if \(gatt !== mediaRequestGatt \|\| !miniReady\.value \|\| !protocolReady\.value\)/);
  assert.match(client, /MEDIA_CONFIG_STALE_SESSION/);
  assert.match(client, /sendErrorAsync\(streamId: Int, code: String\)/);
  assert.match(client, /sendControlAsync\(\s*MelLinkV2Protocol\.encode\(/);
});

test('Android reauthenticates MINI Internet after network loss, handover and stale HTTP completion', async () => {
  const service = await read('android-companion/app/src/main/java/fr/veriteinterdite/mel/MelLinkV2ClientService.kt');
  const network = service.slice(service.indexOf('private val networkCallback'), service.indexOf('override fun onCreate()'));
  assert.match(network, /onLost\(network: Network\) = refreshInternetState\(lostNetwork = network\)/);
  const refresh = service.slice(service.indexOf('private fun refreshInternetState('), service.indexOf('private fun validateMelSession()'));
  assert.match(refresh, /network != lostNetwork/);
  assert.match(refresh, /verifiedNetwork != nextNetwork/);
  assert.match(refresh, /networkGeneration\+\+/);
  assert.match(refresh, /melSessionReady = false/);
  assert.match(refresh, /internetReady\.value = phoneOk && miniReady\.value && protocolReady\.value && melSessionReady/);
  assert.match(refresh, /state\.value = "MINI V2 PRETE"/);
  assert.match(refresh, /if \(revalidate\) validateMelSession\(\)/);
  const validate = service.slice(service.indexOf('private fun validateMelSession()'), service.indexOf('private fun hasBlePermissions()'));
  assert.match(validate, /requestGeneration = networkGeneration/);
  assert.match(validate, /requestNetwork = verifiedNetwork/);
  assert.match(validate, /refreshInternetState\(\)/);
  assert.match(validate, /networkGeneration != requestGeneration/);
  assert.match(validate, /verifiedNetwork != requestNetwork/);
  assert.match(validate, /gatt !== sessionGatt/);
  assert.match(validate, /miniHeartbeatAccepted\(/);
  assert.ok(validate.indexOf('networkGeneration != requestGeneration') < validate.indexOf('melSessionReady = ok'),
    'Do not publish the HTTP ACK before validating the network generation');
  assert.doesNotMatch(validate, /}\.isSuccess/);
});

test('Android ignores delayed BLE scan callbacks after scan stop or a live GATT connection', async () => {
  const source = await read('android-companion/app/src/main/java/fr/veriteinterdite/mel/MelLinkV2ClientService.kt');
  const scan = source.slice(source.indexOf('private val scanCallback = object : ScanCallback()'), source.indexOf('private fun connect(device: BluetoothDevice)'));
  const result = scan.slice(scan.indexOf('override fun onScanResult('), scan.indexOf('override fun onScanFailed('));
  const failure = scan.slice(scan.indexOf('override fun onScanFailed('));
  assert.match(result, /if \(!scanActive \|\| gatt != null\) return/);
  assert.ok(result.indexOf('if (!scanActive || gatt != null) return') < result.indexOf('connecting.compareAndSet(false, true)'));
  assert.match(failure, /if \(!scanActive \|\| gatt != null\) return/);
  assert.ok(failure.indexOf('if (!scanActive || gatt != null) return') < failure.indexOf('scanActive = false'));
  assert.ok(failure.indexOf('if (!scanActive || gatt != null) return') < failure.indexOf('scheduleReconnect()'));
  assert.match(source, /private fun stopScan\(\) \{[\s\S]*?scanActive = false/);
});

test('Android never sends old AUDIO_DATA or AUDIO_END to a reconnected MINI after credit release', async () => {
  const client = await read('android-companion/app/src/main/java/fr/veriteinterdite/mel/MelLinkV2ClientService.kt');
  const audio = client.slice(client.indexOf('private fun sendAudioResponse('), client.indexOf('private fun executeRequest('));
  assert.match(audio, /val intendedGatt = gatt \?: return false/);
  assert.match(audio, /outboundTransferActive\(streamId, credits, intendedGatt\)/);
  assert.match(audio, /awaitOutboundCredit\(streamId, credits\)/);
  const afterCredit = audio.slice(audio.indexOf('if (!awaitOutboundCredit('));
  assert.ok(afterCredit.indexOf('outboundTransferActive(streamId, credits, intendedGatt)') <
    afterCredit.indexOf('sendBulkNoResponse('), 'must check original connection after credit wakeup');
  assert.match(audio, /MelLinkV2Protocol\.AUDIO_DATA[\s\S]*?\), intendedGatt/);
  assert.match(audio, /MelLinkV2Protocol\.AUDIO_END[\s\S]*?\), intendedGatt/);
  assert.match(audio, /requestBlePriority\(BluetoothGatt\.CONNECTION_PRIORITY_BALANCED, intendedGatt\)/);
  const active = client.slice(client.indexOf('private fun outboundTransferActive('), client.indexOf('private fun awaitOutboundCredit('));
  assert.match(active, /outboundCredits\[streamId\] === sem/);
  assert.match(active, /!cancelledOutbound\.contains\(streamId\)/);
  assert.match(active, /gatt === intendedGatt/);
  assert.match(active, /miniReady\.value && protocolReady\.value/);
  const ending = client.slice(client.indexOf('private fun endOutboundTransfer('), client.indexOf('private fun outboundTransferActive('));
  assert.match(ending, /if \(outboundCredits\[streamId\] === sem\) \{[\s\S]*?cancelledOutbound\.remove\(streamId\)/);
  const reset = client.slice(client.indexOf('private fun clearSession('), client.indexOf('private fun resetPhysicalLink('));
  assert.match(reset, /outboundCredits\.values\.forEach \{ it\.release/);
  assert.match(reset, /outboundCredits\.clear\(\)/);
  for (const fn of ['private fun writeGattNoResponse(', 'private fun writeGattBlocking(']) {
    const writer = client.slice(client.indexOf(fn), client.indexOf(fn) + 450);
    assert.match(writer, /if \(intendedGatt != null && client !== intendedGatt\) return false/);
  }
});

test('Android Link V2 accepts event frames and CCCD readiness only from its negotiated GATT event channel', async () => {
  const service = await read('android-companion/app/src/main/java/fr/veriteinterdite/mel/MelLinkV2ClientService.kt');
  const desc = service.slice(service.indexOf('override fun onDescriptorWrite('), service.indexOf('@Deprecated("Deprecated by Android")'));
  assert.match(desc, /descriptor\.uuid != CCCD_UUID/);
  assert.match(desc, /descriptor\.characteristic\?\.uuid != EVENT_TX_UUID/);
  assert.match(desc, /descriptor\.characteristic\?\.service\?\.uuid != SERVICE_UUID/);
  assert.match(desc, /eventTx == null/);
  assert.ok(desc.indexOf('descriptor.characteristic?.uuid != EVENT_TX_UUID') < desc.indexOf('miniReady.value = true'));

  const callbacks = service.slice(service.indexOf('override fun onCharacteristicChanged('), service.indexOf('override fun onCharacteristicWrite('));
  const occurrences = callbacks.match(/if \(!isCurrentLinkEvent\(client, characteristic\)\) return/g) || [];
  assert.equal(occurrences.length, 2, 'legacy and API 33 notification overloads must both check origin');
  const guard = service.slice(service.indexOf('private fun isCurrentLinkEvent('), service.indexOf('private fun handleEventFrame('));
  assert.match(guard, /gatt === client/);
  assert.match(guard, /eventTx != null/);
  assert.match(guard, /characteristic\.uuid == EVENT_TX_UUID/);
  assert.match(guard, /characteristic\.service\?\.uuid == SERVICE_UUID/);
  assert.doesNotMatch(callbacks, /if \(gatt !== client\) return\s+handleEventFrame/);
});
