import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { companionBleDiagnosticsCommand } from "../../src/devices/companion-ble-diagnostics.js";
test("owner BLE diagnostic is fixed, bounded, read only",()=>{
 const {command,timeout_ms,require_success_exit}=companionBleDiagnosticsCommand("COM3");
 assert.equal(timeout_ms,25000);
 assert.equal(require_success_exit,true);
 assert.match(command,/mel\.companion\.ble\.diagnostics\.v1/);
 assert.match(command,/logcat -d -t 1500/);
 assert.match(command,/MULTIPLE_ADB_DEVICES_REFUSED/);
 assert.match(command,/ADB_TARGET_MODEL_NOT_APPROVED/);
 assert.match(command,/M2103K19G/);
 assert.match(command,/if\(\$status -eq 'ADB_CONNECTED'\)\{/);
 assert.match(command,/\$serial=\$Matches\[1\]/);
 assert.match(command,/if\(\$serial -match/);
 assert.doesNotMatch(command,/\$Matches\[1\] -match/);
 assert.match(command,/serial_opened=\$false/);
 assert.match(command,/flash_performed=\$false/);
 assert.doesNotMatch(command,/\b(?:install|reboot|erase_flash|write_flash|adb pair|adb connect)\b/i);
 assert.throws(()=>companionBleDiagnosticsCommand("COM3; echo bad"),/MINI_PORT_INVALID/);
});
test("pc-control exposes scoped command but not caller-controlled shell",async()=>{
 const src=await readFile(new URL("../../src/devices/computer-companion-api.js",import.meta.url),"utf8");
 assert.match(src,/mini\.android\.ble\.diagnose/);
 assert.match(src,/effectivePayload=companionBleDiagnosticsCommand\("COM3"\)/);
 assert.match(src,/REMOTE_ACCESS_DISABLED_LOCALLY/);
});

test("relay requests the fixed BLE action and never prints raw Android Bluetooth logs",async()=>{
 const relay=await readFile(new URL("../../scripts/cloudflare-api-relay-runner.mjs",import.meta.url),"utf8");
 assert.match(relay,/action:'mini\.android\.ble\.diagnose',payload:\{\}/);
 assert.match(relay,/COMPANION_BLE_DIAGNOSTICS/);
 assert.match(relay,/bluetooth_log_line_count/);
 assert.match(relay,/gatt_connection_seen/);
 assert.match(relay,/pairing_removed_seen/);
 assert.match(relay,/pairing_failure_seen/);
 assert.match(relay,/newState=2/);
 assert.match(relay,/session_ok_seen/);
 assert.doesNotMatch(relay,/console\.log\([^\n]*(?:bleProof\.log_events|bleOutput\.stdout)/);
});
