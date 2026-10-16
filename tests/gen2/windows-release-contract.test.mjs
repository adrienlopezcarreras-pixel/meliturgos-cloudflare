import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL('../../' + path, import.meta.url), 'utf8');

test('GEN2-59 build uses canonical Windows assets and exact source SHA', async () => {
  const build = await read('scripts/build-windows-release.ps1');
  assert.match(build, /assets/);
  assert.match(build, /MEL-Computer-Setup\.ps1/);
  assert.match(build, /MEL-Computer-Companion\.ps1/);
  assert.match(build, /WINDOWS_RELEASE_SHA_INVALID/);
  assert.match(build, /release-manifest\.json/);
  assert.match(build, /Get-FileHash -Algorithm SHA256/);
  assert.match(build, /mel\.windows-release-manifest\.v1/);
  assert.match(build, /LastWriteTime = \$epoch/);
  assert.doesNotMatch(build, /dist\/MEL-Computer/);
});

test('GEN2-59 signing is secret-backed and happens before release hashing', async () => {
  const build = await read('scripts/build-windows-release.ps1');
  const sign = await read('scripts/sign-windows-release.ps1');
  assert.match(build, /MEL_WINDOWS_SIGNING_PFX_BASE64/);
  assert.match(build, /MEL_WINDOWS_SIGNING_PFX_PASSWORD/);
  assert.ok(build.indexOf('sign-windows-release.ps1') < build.indexOf('$manifestFiles = @()'));
  assert.match(sign, /Set-AuthenticodeSignature/);
  assert.doesNotMatch(sign, /EphemeralKeySet/);
  assert.match(sign, /X509KeyStorageFlags\]::UserKeySet/);
  assert.match(sign, /X509KeyStorageFlags\]::Exportable/);
  assert.match(sign, /\.Dispose\(\)/);
  assert.match(sign, /WINDOWS_SIGN_PRIVATE_KEY_MISSING/);
  assert.match(sign, /Remove-Item -Force \$tempPfx/);
});

test('GEN2-59 verifier fails closed on package, manifest and file checksum drift', async () => {
  const verify = await read('scripts/verify-windows-release.ps1');
  assert.match(verify, /WINDOWS_PACKAGE_CHECKSUM_MISMATCH/);
  assert.match(verify, /WINDOWS_MANIFEST_SHA_MISMATCH/);
  assert.match(verify, /WINDOWS_MANIFEST_FILE_HASH_MISMATCH/);
  assert.match(verify, /WINDOWS_RELEASE_VERIFIED/);
});

test('GEN2-59 workflow packages on windows-latest and requires exact SHA for manual release', async () => {
  const workflow = await read('.github/workflows/windows-release-build.yml');
  assert.match(workflow, /runs-on: windows-latest/);
  assert.match(workflow, /expected_sha:/);
  assert.match(workflow, /git rev-parse HEAD/);
  assert.match(workflow, /WINDOWS_RELEASE_EXACT_SHA_MISMATCH/);
  assert.match(workflow, /MEL_WINDOWS_SIGNING_PFX_BASE64/);
  assert.match(workflow, /MEL_WINDOWS_SIGNING_PFX_PASSWORD/);
  assert.match(workflow, /Get-AuthenticodeSignature/);
  assert.match(workflow, /actions\/upload-artifact@/);
  // Windows release may bundle an interactive Android Wi-Fi pairing helper,
  // but must never silently build, ship or install Android APK binaries.
  assert.match(workflow, /tools\/android-companion\/MEL-Android-WiFi-Pairing\.ps1/);
  assert.doesNotMatch(workflow, /gradle|android-apk-build|adb install|\.apk\b/i);
});


test('native Windows Companion refreshes only its authenticated MEL engine with atomic syntax-checked replacement', async () => {
  const source = await read('windows-companion/MEL-Companion.cs');
  assert.match(source, /\/api\/computer\/v1\/companion/);
  assert.match(source, /DeviceHeaders\(\)/);
  assert.match(source, /MaybeRefreshCompanionEngine/);
  assert.match(source, /TotalSeconds < 30/);
  assert.match(source, /System\.Management\.Automation\.Language\.Parser/);
  assert.match(source, /ValidatePowerShellFile/);
  assert.match(source, /File\.Replace\(temp, CompanionPath, backup, true\)/);
  assert.match(source, /Sha256Hex/);
  assert.match(source, /RestartCompanion\(\)/);
  assert.doesNotMatch(source, /powershell\.exe.*Invoke-WebRequest/si);
  assert.match(source, /CompanionRunning\(\)/);
  assert.match(source, /heartbeat\["engine_heartbeat_at"\] = DateTimeOffset\.UtcNow\.ToUnixTimeMilliseconds\(\)/);
  assert.match(source, /engine_refresh_status/);
  assert.match(source, /engine_update_required/);
  assert.match(source, /MaybeRefreshCompanionEngine\(true\)/);
  assert.match(source, /public const string Version = "2\.3\.14"/);
  assert.match(source, /StartBackgroundSupervisor/);
  assert.match(source, /System\.Threading\.Timer/);
});

test('Windows release includes a benchmark without running it automatically',async()=>{
 const build=await read('scripts/build-windows-release.ps1');
 const verify=await read('scripts/verify-windows-release.ps1');
 const workflow=await read('.github/workflows/windows-release-build.yml');
 assert.match(build,/WINDOWS_LOCAL_AI_BENCHMARK_MISSING/);
 assert.match(build,/MEL-Local-AI-Benchmark\.ps1/);
 assert.match(verify,/MEL-Local-AI-Benchmark\.ps1/);
 assert.match(workflow,/scripts\/companion-local-ai-benchmark\.ps1/);
 assert.doesNotMatch(build,/&\s*\$benchmarkSource/);
});


test('native Companion installs the complete MINI read-only USB bundle and exposes an attended button',async()=>{
 const source=await read('windows-companion/MEL-Companion.cs');
 const helper=await read('windows-companion/MEL-MINI-USB-Preflight.ps1');
 const build=await read('scripts/build-windows-release.ps1');
 const verify=await read('scripts/verify-windows-release.ps1');
 assert.match(source,/MiniUsbPreflightFiles/);
 assert.match(source,/miniUsbBundleComplete/);
 assert.match(source,/RunMiniUsbPreflight/);
 assert.match(source,/Contrôle USB MINI/);
 assert.match(source,/SerialPort\.GetPortNames\(\)/);
 assert.match(source,/DialogResult\.Yes/);
 assert.match(source,/UseShellExecute=true/);
 assert.match(source,/-NoExit -File/);
 assert.doesNotMatch(source,/\bwrite_flash\b|\berase_flash\b/);
 for(const file of ['MEL-MINI-USB-Preflight.ps1','local_readonly_preflight.py',
  'inspect_partitions.py','inspect_ota_state.py','inspect_image.py']){
  assert.ok(build.includes(file),'package missing: '+file);
  assert.ok(source.includes(file),'installation missing: '+file);
 }
 assert.match(verify,/WINDOWS_MINI_USB_PREFLIGHT_FILE_MISSING/);
 assert.match(helper,/AUTORISER_LECTURE_USB_MINI/);
 assert.match(helper,/flash_allowed -ne \$false/);
 assert.doesNotMatch(helper,/\bwrite_flash\b|\berase_flash\b/);
});

test('Companion device card explains stale ONLINE phase when current status is offline', async () => {
  const ui = await read('windows-companion/MEL-Companion.cs');
  assert.match(ui, /var onlineDevice=Bool\(d,"online"\)/);
  assert.match(ui, /Dernier état reçu : ONLINE · connexion actuelle hors ligne/);
  assert.match(ui, /string\.Equals\(phase,"ONLINE",StringComparison\.OrdinalIgnoreCase\)/);
});

test('Companion USB preflight preserves Windows PowerShell UTF-8 and surfaces refusal evidence', async () => {
 const helper=await read('windows-companion/MEL-MINI-USB-Preflight.ps1');
 assert.match(helper,/\[Console\]::OutputEncoding/);
 assert.match(helper,/failedProof\.error/);
 assert.match(helper,/Partition table valid:/);
 assert.match(helper,/OTA metadata unambiguous:/);
 assert.match(helper,/Running slot verified on device:/);
 assert.match(helper,/Flash allowed: False/);
 assert.match(helper,/MINI_USB_PREFLIGHT_FAILED/);
 assert.doesNotMatch(helper,/flash_allowed\s*=\s*\$true/);
});

test('Companion USB MINI preselects COM3 when present while retaining fallback', async () => {
 const source=await read('windows-companion/MEL-Companion.cs');
 assert.match(source,/Array\.IndexOf\(ports,"COM3"\)/);
 assert.match(source,/SelectedIndex=miniPortIndex>=0\?miniPortIndex:0/);
});
