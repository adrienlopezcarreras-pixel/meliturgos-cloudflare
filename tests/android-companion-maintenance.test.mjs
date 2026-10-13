import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {androidMaintenancePcCommand} from '../src/devices/android-maintenance-companion.js';
import {androidStagePcCommand} from '../src/devices/android-apk-stage-companion.js';
const api=readFileSync('src/devices/computer-companion-api.js','utf8');
const relay=readFileSync('scripts/cloudflare-api-relay-runner.mjs','utf8');
test('Android audit is read-only; Bluetooth cannot silently install APKs',()=>{
 const {command,timeout_ms}=androidMaintenancePcCommand('android.maintenance.assess');
 assert.ok(command.length<8192);assert.equal(timeout_ms,25000);
 for(const v of ['devices -l','bluetooth_apk_install_supported=$false','wifi_pairing_requires_phone_approval=$true','apk_install_performed=$false'])assert.ok(command.includes(v));
 assert.doesNotMatch(command,/ install -r | adb pair | adb pull | pm clear /);
});
test('APK stage permits only local Downloads file and verifies SHA-256',()=>{
 const {command}=androidStagePcCommand({filename:'MEL-Android-0.7.10.apk',sha256:'a'.repeat(64)});
 assert.ok(command.length<8192);
 for(const v of ['Downloads','Get-FileHash','android-releases','Move-Item','apk_installed=$false'])assert.ok(command.includes(v));
 assert.throws(()=>androidStagePcCommand({filename:'../other.apk',sha256:'a'.repeat(64)}),/ANDROID_APK_FILENAME_INVALID/);
 assert.throws(()=>androidStagePcCommand({filename:'MEL.apk',sha256:'invalid'}),/ANDROID_APK_SHA256_INVALID/);
});
test('ADB installation checks paired private Wi-Fi, identity, signature, rollback copy and increasing version',()=>{
 const sha='b'.repeat(64);
 const {command,timeout_ms}=androidMaintenancePcCommand('android.maintenance.install',{serial:'192.168.1.55:39547',sha256:sha});
 assert.ok(command.length<=8192);assert.equal(timeout_ms,120000);
 for(const v of ['fr.veriteinterdite.mel','android-releases','apksigner.bat','aapt.exe',
  'ANDROID_SIGNING_CERTIFICATE_CHANGED','ANDROID_VERSION_NOT_NEWER',
  'ANDROID_EXISTING_APP_REQUIRED','android-backups','shell pm path',' install -r ','dumpsys package',
  'ANDROID_WIFI_PRIVATE_ADDRESS_REQUIRED','ANDROID_DEVICE_NOT_AUTHORIZED',
  'automatic_rollback_verified=$false','app_data_backup_performed=$false']){
    assert.ok(command.includes(v),v);
  }
 assert.doesNotMatch(command,/install -d|uninstall|pm clear|adb pair|--grant-all|force-stop/);
 assert.throws(()=>androidMaintenancePcCommand('android.maintenance.install',{serial:"192.168.1.55:1234';",sha256:sha}),/ANDROID_WIFI_SERIAL_INVALID/);
});
test('OIDC is audit only; installs and stages require owner + explicit approval + local opt-in',()=>{
 const proof=api.split('const PC_CONTROL_PROOF_ACTIONS=new Set(')[1].split(';')[0];
 assert.match(proof,/android\.maintenance\.assess/);
 assert.doesNotMatch(proof,/android\.maintenance\.install|android\.maintenance\.stage/);
 for(const value of ['ANDROID_APK_INSTALL_CONFIRMATION_REQUIRED','INSTALL_MEL_ANDROID_APPROVED',
  'ack_wifi_adb_pairing','ack_local_apk_backup','ANDROID_APK_STAGE_OWNER_CONFIRMATION_REQUIRED',
  'ack_local_apk_stage','remote_access_enabled!==true','androidStagePcCommand',
  'androidMaintenancePcCommand']) assert.ok(api.includes(value),value);
 assert.match(relay,/action:'android\.maintenance\.assess'/);
 assert.match(relay,/ANDROID_COMPANION_MAINTENANCE_ASSESS=/);
 assert.doesNotMatch(relay,/action:'android\.maintenance\.install'|action:'android\.maintenance\.stage'/);
});
test('Windows Companion honors strict exit codes for every Android maintenance route',()=>{
 const asset=readFileSync('assets/MEL-Computer-Companion.ps1','utf8');
 const dist=readFileSync('dist/MEL-Computer-Companion.ps1','utf8');
 assert.equal(asset,dist);
 assert.match(asset,/if \(\$payload\.require_success_exit -eq \$true -and \$p\.ExitCode -ne 0\)/);
 assert.match(asset,/SYSTEM_EXEC_NONZERO_EXIT_CODE/);
 assert.equal((api.match(/require_success_exit:true/g)||[]).length,4);
});

test('local Wi-Fi ADB pairing is bundled, interactive and never relays a pairing PIN',()=>{
 const wizard=readFileSync('tools/android-companion/MEL-Android-WiFi-Pairing.ps1','utf8');
 const build=readFileSync('scripts/build-windows-release.ps1','utf8');
 const verify=readFileSync('scripts/verify-windows-release.ps1','utf8');
 assert.match(wizard,/param\(\s*\[switch\]\$Pair/);
 assert.match(wizard,/Read-Host 'Adresse IP:port d appairage/);
 assert.match(wizard,/& \$adb pair \$pairAddress/);
 assert.match(wizard,/& \$adb connect \$connectAddress/);
 assert.match(wizard,/ANDROID_WIFI_PRIVATE_LAN_REQUIRED/);
 assert.match(wizard,/ANDROID_ADB_CONNECTED_DEVICE_NOT_CONFIRMED/);
 assert.doesNotMatch(wizard,/install -r|--pairing-code|Invoke-RestMethod|x-mel-github-oidc|Authorization=/);
 assert.match(build,/tools\\android-companion\\MEL-Android-WiFi-Pairing.ps1/);
 assert.match(verify,/WINDOWS_ANDROID_WIFI_PAIRING_HELPER_MISSING/);
});
