#!/usr/bin/env node
// A read-only audit. This is not a device or live-service stress test.
// Intentionally fails if one end of the production MINI/Android protocol is missing.
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = p => fs.readFileSync(path.join(root,p), 'utf8');
const exists = p => fs.existsSync(path.join(root,p));
const base = 'android-companion/app/src/main/java/fr/veriteinterdite/mel/';
const mini = read('firmware/waveshare-terminal/main/mel_link_v2_server.cpp');
const miniProtocol = read('firmware/waveshare-terminal/main/mel_link_v2_protocol.h');
const miniTransport = read('firmware/waveshare-terminal/main/mel_link_v2_transport.cpp');
const androidMain = read(base+'MainActivity.kt');
const androidManifest = read('android-companion/app/src/main/AndroidManifest.xml');
const androidLegacy = read(base+'MelBleBridgeService.kt');
const androidGradle = read('android-companion/app/build.gradle.kts');
const androidClient = exists(base+'MelLinkV2ClientService.kt') ? read(base+'MelLinkV2ClientService.kt') : '';
const androidProtocol = exists(base+'MelLinkV2Protocol.kt') ? read(base+'MelLinkV2Protocol.kt') : '';
const windows = read('windows-companion/MEL-Companion.cs');
const api = read('src/devices/computer-companion-api.js');
const relay = read('scripts/cloudflare-api-relay-runner.mjs');
const updater = read('.github/workflows/mini-windows-updater.yml');
const firmwareReadme = read('firmware/waveshare-terminal/README.md');
const androidReadme = read('android-companion/README.md');
const firmwareHeader = read('firmware/waveshare-terminal/main/mel_terminal.h');
const appVersion = androidGradle.match(/versionName = "([^"]+)"/)?.[1]||null;
const firmwareVersion = firmwareHeader.match(/MEL_FW_VERSION "([^"]+)"/)?.[1]||null;
const checks = [];
const check = (name, condition, severity, detail) => checks.push({name,pass:!!condition,severity,detail});
check('MINI uses BLE peripheral/server',/ble_gap_adv_start/.test(mini)&&/BLE_GATT_SVC_TYPE_PRIMARY/.test(mini),'blocker','MINI Link V2 GATT server');
check('MINI binary protocol is V2',/MEL_LINK_V2_PROTOCOL_VERSION 2/.test(miniProtocol),'blocker','M2 frame contract');
check('MINI both GATT control and bulk writes are encrypted',(mini.match(/BLE_GATT_CHR_F_WRITE_ENC/g)||[]).length >= 2,'blocker','All phone-to-MINI write paths protected by link encryption');
check('MINI enables secure-connections bonding',/ble_hs_cfg\.sm_bonding = 1/.test(mini)&&/ble_hs_cfg\.sm_sc = 1/.test(mini),'blocker','BLE encryption keys persist for reconnection');
check('MINI readiness requires verified encrypted link',/g_link_encrypted\.load\(\)/.test(mini)&&/BLE_GAP_EVENT_ENC_CHANGE/.test(mini),'blocker','Subscription alone is not link authentication');
check('Android bonding is required before negotiation',/BluetoothDevice\.BOND_BONDED/.test(androidClient)&&/\.createBond\(\)/.test(androidClient)&&/bondReceiver/.test(androidClient),'blocker','Request explicit Android OS pairing to encrypted MINI');
check('MEDIA_CONFIG cannot bypass a verified session',/MEDIA_CONFIG rejected: Android V2 session not verified/.test(miniTransport),'blocker','Media network configuration is session-scoped');
check('BLE MITM-resistant pairing has physical proof',false,'warning','Just Works bonding gives encrypted transport but does not guarantee MITM authentication');
check('SESSION frame is validated before ready',!(/apply_android_session_clock\(payload, header.payload_len\);\s*g_session_ready.store\(true\)/.test(miniTransport)),'blocker','Current code marks SESSION ready even when clock payload validation fails');
check('Android ships BLE GATT client',!!androidClient&&/connectGatt/.test(androidClient)&&/onServicesDiscovered/.test(androidClient),'blocker','Client service must exist in APK');
check('Android activates Link V2 client',/MelLinkV2ClientService/.test(androidMain)&&/MelLinkV2ClientService/.test(androidManifest),'blocker','Activity/service must start central mode');
check('Android ships matching Link V2 framing',/HEADER_SIZE\s*=\s*13/.test(androidProtocol)&&/VERSION\s*=\s*2/.test(androidProtocol),'blocker','Binary ABI/version must match');
check('Android grants BLE scanner permission',/android.permission.BLUETOOTH_SCAN/.test(androidManifest),'blocker','Android >=12 requires runtime scan permission');
check('Legacy Android advertising not selected',!/MelBleBridgeService::class.java/.test(androidMain),'blocker','Two peripheral/GATT servers cannot form Link V2');
check('Android release version beyond legacy',!!appVersion&&!appVersion.startsWith('0.6.58-'),'warning','Installed main version: '+appVersion);
check('MINI README describes current firmware',!!firmwareVersion&&firmwareReadme.includes(firmwareVersion),'warning','README must describe '+firmwareVersion);
check('Android README describes actual UI',/Compose/.test(androidReadme)&&!/Activity native minimale/.test(androidReadme),'warning','README currently refers to an early prototype');
check('Windows remote consent defaults off',/d\["remote_access_enabled"\] = false/.test(windows),'blocker','Local opt-in must be explicit');
check('OIDC cannot hard reset MINI',/PC_CONTROL_PROOF_ACTIONS=new Set\(\["system.info","serial.list","serial.read","serial.inspect"\]\)/.test(api)&&!/action:'serial.hard_reset'/.test(relay),'blocker','Periodic GitHub relay is read-only');
check('Legacy updater is not current',!/MEL-MINI-Updater-0\.4\.37/.test(updater),'warning','Old firmware updater must not be used as current');
check('True OTA rollback proven',/CONFIG_BOOTLOADER_APP_ROLLBACK_ENABLE=y/.test(read('firmware/waveshare-terminal/sdkconfig.defaults')),'warning','Not verifiable on hardware in CI');

const blockers = checks.filter(c=>c.severity==='blocker'&&!c.pass);
const warnings = checks.filter(c=>c.severity==='warning'&&!c.pass);
const output = {
 schema:'mel.mini-android-windows-audit.v1',
 source:'repository-structural-read-only',
 exact_sha:process.env.GITHUB_SHA||'local',
 firmware_version:firmwareVersion,
 android_version:appVersion,
 checks,
 passed:checks.filter(c=>c.pass).length,
 blocker_count:blockers.length,
 warning_count:warnings.length,
 conclusion:blockers.length?'BLOCKED':'SOURCE_CONTRACTS_PASS',
 limitations:[
 'No physical MINI BLE/ES8311/camera test',
 'No real Android phone reconnect STT/TTS trial',
 'No real Windows Companion access or serial hardware test',
 'Source structural checks alone are not runtime proof'
 ]
};
const file=process.argv.indexOf('--report');
if(file>=0&&process.argv[file+1]){
 fs.mkdirSync(path.dirname(process.argv[file+1]),{recursive:true});
 fs.writeFileSync(process.argv[file+1],JSON.stringify(output,null,2)+'\n');
}
console.log('MINI_TRIAD_AUDIT '+JSON.stringify({passed:output.passed,blockers:blockers.map(c=>c.name),warnings:warnings.map(c=>c.name),conclusion:output.conclusion}));
if(blockers.length)process.exitCode=2;
