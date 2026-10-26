import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL('../../' + path, import.meta.url), 'utf8');

test('packaged MINI installer reaches the installed button path without executing or requiring the read-only bundle', async () => {
  const source=await read('windows-companion/MEL-Companion.cs');
  const build=await read('scripts/build-windows-release.ps1');
  assert.match(build,/Copy-Item -LiteralPath \$miniInstaller -Destination \(Join-Path \$stage 'MEL-Waveshare-Flash.ps1'\)/);
  assert.match(source,/MiniFirstInstallPath = Path.Combine\(MelDir, "MEL-Waveshare-Flash.ps1"\)/);
  const install=source.slice(source.indexOf('public static void InstallFiles('),source.indexOf('public static void ConfigureStartup('));
  assert.match(install,/File.Exists\(packagedMiniInstaller\)/);
  assert.match(install,/Path.GetFullPath\(packagedMiniInstaller\), Path.GetFullPath\(MiniFirstInstallPath\)/);
  assert.match(install,/File.Copy\(packagedMiniInstaller, MiniFirstInstallPath, true\)/);
  assert.ok(install.indexOf('File.Copy(packagedMiniInstaller')<install.indexOf('bool miniUsbBundleComplete'));
  assert.doesNotMatch(install,/RunMiniFirstInstall|RunHidden|Process.Start|EFFACER_MINI/);
});

test('GEN2-59 build uses canonical Windows assets and exact source SHA', async () => {
  const build = await read('scripts/build-windows-release.ps1');
  assert.match(build, /assets/);
  assert.match(build, /MEL-Computer-Setup\.ps1/);
  assert.match(build, /MEL-portrait\.png/);
  assert.match(build, /WINDOWS_PORTRAIT_MISSING/);
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
  assert.doesNotMatch(source, /heartbeat\["engine_heartbeat_at"\]/);
  assert.match(source, /heartbeat_diag/);
  assert.match(source, /engine_refresh_status/);
  assert.match(source, /engine_update_required/);
  assert.match(source, /MaybeRefreshCompanionEngine\(true\)/);
  assert.match(source, /public const string Version = "2\.3\.17"/);
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
 assert.match(source,/CreateNoWindow=true/);
 assert.match(source,/RunHidden/);
 assert.doesNotMatch(source,/-NoExit -File/);
 assert.doesNotMatch(source,/\bwrite_flash\b|\berase_flash\b/);
 for(const file of ['MEL-MINI-USB-Preflight.ps1','local_readonly_preflight.py',
  'inspect_partitions.py','inspect_ota_state.py','inspect_image.py']){
  assert.ok(build.includes(file),'package missing: '+file);
  assert.ok(source.includes(file),'installation missing: '+file);
 }
 assert.match(verify,/WINDOWS_MINI_USB_PREFLIGHT_FILE_MISSING/);
 const backup=await read('windows-companion/MEL-MINI-USB-Backup.ps1');
 assert.match(source,/MiniUsbBackupPath/);
 assert.match(source,/RunMiniUsbBackup/);
 assert.match(source,/SAUVEGARDER_MINI_USB|Sauvegarder la MINI par USB/);
 assert.match(build,/MEL-MINI-USB-Backup\.ps1/);
 assert.match(verify,/MEL-MINI-USB-Backup\.ps1/);
 assert.match(backup,/SAUVEGARDER_MINI_USB/);
 assert.match(backup,/full-flash\.bin/);
 assert.match(backup,/full-flash-verify\.bin/);
 assert.match(backup,/MINI_BACKUP_DOUBLE_READ_HASH_MISMATCH/);
 assert.match(backup,/flash_allowed=\$false/);
 assert.doesNotMatch(backup,/\bwrite[_-]flash\b|\berase[_-]flash\b/i);
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
 assert.match(helper,/Failed probe:/);
 assert.match(helper,/probe\.exit_code/);
 assert.match(helper,/probeName/);
 assert.match(helper,/streamProperty = \$probe\.PSObject\.Properties\[\$streamName\]/);
 assert.match(helper,/\$streamProperty\.Value/);
 assert.match(helper,/\[truncated\]/);
 assert.match(helper,/Partition table valid:/);
 assert.match(helper,/OTA metadata unambiguous:/);
 assert.match(helper,/Running slot verified on device:/);
 assert.match(helper,/Flash allowed: False/);
 assert.match(helper,/MINI_USB_PREFLIGHT_FAILED/);
 assert.doesNotMatch(helper,/flash_allowed\s*=\s*\$true/);
});

test('MINI USB chooses an installed esptool interpreter instead of blindly using Python 3', async () => {
 const helper=await read('windows-companion/MEL-MINI-USB-Preflight.ps1');
 assert.match(helper,/foreach \(\$version in @\('3\.13','3\.12'/);
 assert.match(helper,/-m esptool version/);
 assert.match(helper,/MINI_USB_ESPTOOL_REQUIRED/);
 assert.doesNotMatch(helper,/\$pythonArgs = @\('-3'\)\s*\n\s*} else/);
});

test('Companion uses docked, responsive shell and wrapped device cards', async () => {
 const source=await read('windows-companion/MEL-Companion.cs');
 assert.match(source,/var shell=new TableLayoutPanel/);
 assert.match(source,/Dock=DockStyle.Fill,ColumnCount=1,RowCount=6/);
 assert.match(source,/shell.Controls.Add\(executor,0,2\)/);
 assert.match(source,/shell.Controls.Add\(cards,0,4\)/);
 assert.match(source,/AutoScaleMode=AutoScaleMode.None; \/\/ sizes are scaled explicitly with k/);
 assert.match(source,/readonly float k=MelApp.DpiScale\(\);/);
 assert.doesNotMatch(source,/new RowStyle\(SizeType.Absolute,\d/, "fixed rows must be DPI-scaled");
 assert.match(source,/var workActions=new FlowLayoutPanel/);
 assert.match(source,/var sectionActions=new FlowLayoutPanel/);
 assert.match(source,/cards=new FlowLayoutPanel/);
 assert.match(source,/WrapContents=true,AutoScroll=true/);
 assert.match(source,/twoColumns=width>=S\(1000\)/);
 assert.match(source,/var layout=new TableLayoutPanel/);
 assert.match(source,/layout.SetColumnSpan\(details,2\)/);
 assert.match(source,/oldCard.Dispose\(\)/);
 assert.match(source,/RunMiniUsbBackup/);
 assert.match(source,/ChooseMiniUsbAction/);
 assert.match(source,/RunAndroidWifiPairing/);
 assert.doesNotMatch(source,/void LayoutDashboard\(\)/);
 assert.doesNotMatch(source,/p\.Paint\+=delegate\(object sender,PaintEventArgs ev\)/);
});

test('Companion USB MINI preselects COM3 when present while retaining fallback', async () => {
 const source=await read('windows-companion/MEL-Companion.cs');
 assert.match(source,/Array\.IndexOf\(ports,"COM3"\)/);
 assert.match(source,/SelectedIndex=miniPortIndex>=0\?miniPortIndex:0/);
});

test('MINI destructive installer stays single, verified and explicitly addressed', async () => {
  const script = await read('dist/MEL-Waveshare-Flash.ps1');
  const count = token => script.split(token).length - 1;
  assert.equal(count('finally {\n  $pass = $null'), 1, 'duplicate installer cleanup');
  assert.equal(count('erase_flash'), 1, 'duplicate erase operation');
  assert.match(script, /MINI_USB_PORT_NOT_CONFIRMED/);
  assert.match(script, /MINI_ESP32S3_IDENTITY_UNVERIFIED/);
  assert.match(script, /chip_id/);
  assert.match(script, /EFFACER_MINI/);
  assert.match(script, /Get-FileHash -Algorithm SHA256/);
  assert.match(script, /\$installInfo = \$info\.installer/);
  assert.doesNotMatch(script, /\$installInfo = \$info\.firmware/);
  assert.ok(script.indexOf('chip_id') < script.indexOf('erase_flash'));
});
