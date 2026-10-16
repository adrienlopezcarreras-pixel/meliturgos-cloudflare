import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = path => readFile(new URL("../../" + path, import.meta.url), "utf8");

test("Windows release embeds ADB Wi-Fi monitor and installs it locally", async () => {
  const build = await source("scripts/build-windows-release.ps1");
  const native = await source("windows-companion/MEL-Companion.cs");
  assert.match(build, /WINDOWS_ADB_WIFI_SOURCE_MISSING/);
  assert.match(build, /__ADB_WIFI_B64__/);
  assert.match(native, /AdbWifiB64/);
  assert.match(native, /StartAdbWifiMonitor/);
  assert.match(native, /StopAdbWifiMonitor/);
  assert.match(native, /ADB Wi-Fi : connecté/);
});

test("ADB Wi-Fi monitor never auto-installs APKs or flashes firmware", async () => {
  const script = await source("windows-companion/MEL-ADB-WiFi.ps1");
  assert.match(script, /adb-wifi-status\.v1/);
  assert.match(script, /_adb-tls-connect/);
  assert.match(script, /fr\.veriteinterdite\.mel/);
  assert.match(script, /android-adb-wifi\.json/);
  assert.doesNotMatch(script, /\b(?:install|uninstall|flash|erase|reboot|root)\b/i);
  assert.doesNotMatch(script, /tcpip 5555/);
});


test("ADB Wi-Fi status includes installed Android versionCode and handles unavailable ADB explicitly", async () => {
  const script = await source("windows-companion/MEL-ADB-WiFi.ps1");
  assert.match(script, /mel_version_code/);
  assert.match(script, /versionCode=/);
  assert.match(script, /ADB_PLATFORM_TOOLS_MISSING/);
});


test("ADB diagnostics failures invalidate previously connected status", async () => {
  const script = await source("windows-companion/MEL-ADB-WiFi.ps1");
  assert.match(script, /ADB_DIAGNOSTIC_FAILED/);
  assert.match(script, /connected=\$false/);
  assert.match(script, /Write-StatusReport \$status/);
  assert.match(script, /function Write-StatusReport/);
});


test("Wi-Fi endpoint is persisted only after confirmed ADB connection to that endpoint", async () => {
  const script = await source("windows-companion/MEL-ADB-WiFi.ps1");
  const reconnect = script.split("function Attempt-Reconnect {")[1].split("function Scan {")[0];
  const verify = reconnect.indexOf('[regex]::Escape($endpoint)');
  const persist = reconnect.indexOf('Set-Content -LiteralPath $saved');
  assert.ok(verify >= 0 && persist > verify, "endpoint must be verified before storing");
  assert.match(reconnect, /already connected to/);
  assert.ok(reconnect.includes('failed|unable|refused'));
});


test("ADB identity must be verified before reporting a connected Android phone", async () => {
  const script = await source("windows-companion/MEL-ADB-WiFi.ps1");
  assert.match(script, /ADB_DEVICE_IDENTITY_UNVERIFIED/);
  assert.match(script, /IsNullOrWhiteSpace\(\$status\.android_model\)/);
  assert.match(script, /IsNullOrWhiteSpace\(\$status\.android_version\)/);
});


test("Failed ADB process exit cannot masquerade as successful device telemetry", async () => {
  const script = await source("windows-companion/MEL-ADB-WiFi.ps1");
  const run = script.split("function Run-Adb")[1].split("function Serial")[0];
  assert.match(run, /\$process\.ExitCode -ne 0/);
  assert.match(run, /ADB_COMMAND_FAILED/);
  assert.match(run, /WaitForExit\(8000\)/);
});


test("failed Wi-Fi endpoint connection falls through to next candidate", async () => {
  const script = await source("windows-companion/MEL-ADB-WiFi.ps1");
  const reconnect = script.split("function Attempt-Reconnect {")[1].split("function Scan {")[0];
  assert.match(reconnect, /try \{ \$result=\(Run-Adb -arglist @\("connect",\$endpoint\)\)/);
  assert.match(reconnect, /catch \{ continue \}/);
});


test("mDNS discovery failure preserves saved endpoint fallback", async () => {
  const script = await source("windows-companion/MEL-ADB-WiFi.ps1");
  const reconnect = script.split("function Attempt-Reconnect {")[1].split("function Scan {")[0];
  assert.match(reconnect, /try \{ \$discovered=Run-Adb -arglist @\("mdns","services"\) \} catch \{ \$discovered=@\(\) \}/);
  assert.ok(reconnect.indexOf("foreach ($line in $discovered)") < reconnect.indexOf("if (Test-Path -LiteralPath $saved)"));
});


test("failed post-connect ADB serial probe tries next endpoint", async () => {
  const script = await source("windows-companion/MEL-ADB-WiFi.ps1");
  const reconnect = script.split("function Attempt-Reconnect {")[1].split("function Scan {")[0];
  assert.match(reconnect, /try \{ \$serials=\(Run-Adb -arglist @\("devices","-l"\)\)/);
  assert.match(reconnect, /catch \{ continue \}/);
});


test("unreadable saved ADB endpoint does not abort discovered endpoint attempts", async () => {
  const script = await source("windows-companion/MEL-ADB-WiFi.ps1");
  const reconnect = script.split("function Attempt-Reconnect {")[1].split("function Scan {")[0];
  assert.match(reconnect, /try \{ \$last=\(Get-Content -LiteralPath \$saved -Raw\)\.Trim\(\) \} catch \{ \$last="" \}/);
});


test("failed endpoint-cache write does not invalidate verified ADB connection", async () => {
  const script = await source("windows-companion/MEL-ADB-WiFi.ps1");
  const reconnect = script.split("function Attempt-Reconnect {")[1].split("function Scan {")[0];
  assert.match(reconnect, /try \{ Set-Content -LiteralPath \$saved -Value \$endpoint -Encoding ASCII \} catch \{ \}/);
});


test("verified saved endpoint is attempted ahead of discovered candidates", async () => {
  const script = await source("windows-companion/MEL-ADB-WiFi.ps1");
  const reconnect = script.split("function Attempt-Reconnect {")[1].split("function Scan {")[0];
  assert.match(reconnect, /\$targets = @\(\$last\) \+ @\(\$targets\)/);
});


test("Windows Companion exposes explicit local Android Wi-Fi pairing without collecting pairing code", async () => {
  const native = await source("windows-companion/MEL-Companion.cs");
  const build = await source("scripts/build-windows-release.ps1");
  const helper = await source("tools/android-companion/MEL-Android-WiFi-Pairing.ps1");
  assert.match(native, /Configurer ADB Wi-Fi/);
  assert.match(native, /RunAndroidWifiPairing/);
  assert.match(native, /AndroidWifiPairingPath/);
  assert.match(build, /ANDROID_WIFI_PAIRING_HELPER_MISSING/);
  assert.match(build, /MEL-Android-WiFi-Pairing\.ps1/);
  assert.match(helper, /\$adb pair \$pairAddress/);
  assert.match(helper, /ANDROID_LOCAL_PAIRING_FAILED/);
  assert.doesNotMatch(native, /pairing code|PairingCode|pairCode/i);
});

test("Windows Companion ADB status provides actionable diagnostics, not false auto-reconnect promises", async () => {
  const native = await source("windows-companion/MEL-Companion.cs");
  assert.match(native, /Android Platform Tools introuvables/);
  assert.match(native, /ADB Wi-Fi : échec · /);
  assert.match(native, /téléphone non appairé ou déconnecté · utilisez Configurer ADB Wi-Fi/);
});

test("Android Wi-Fi pairing helper resolves ADB from standard local paths and PATH", async () => {
  const helper = await source("tools/android-companion/MEL-Android-WiFi-Pairing.ps1");
  assert.match(helper, /Android\\platform-tools\\adb\.exe/);
  assert.match(helper, /Android\\Sdk\\platform-tools\\adb\.exe/);
  assert.match(helper, /Get-Command -Name 'adb\.exe'/);
  assert.doesNotMatch(helper, /ANDROID_SDK_ROOT_REQUIRED/);
});

test("Companion manual refresh runs one bounded ADB diagnostic and reports actionable status", async () => {
 const native = await source("windows-companion/MEL-Companion.cs");
 assert.match(native, /RefreshAdbDiagnostics\(\)/);
 assert.match(native, /WaitForExit\(12000\)/);
 assert.match(native, /diagnostic expiré · réessayez/);
 assert.match(native, /outils ADB introuvables/);
 assert.match(native, /Configurer ADB Wi-Fi/);
 assert.match(native, /adbRefreshBusy/);
});

test("ADB Wi-Fi monitor rotates its continuously appended log at a bounded size", async () => {
 const script = await source("windows-companion/MEL-ADB-WiFi.ps1");
 assert.match(script, /function Write-AdbLog/);
 assert.match(script, /\$info\.Length -ge 1MB/);
 assert.match(script, /\$backup = "\$log\.1"/);
 assert.equal((script.match(/Add-Content -LiteralPath \$log/g) || []).length, 1);
 assert.match(script, /Write-AdbLog \(/);
});

test("ADB monitor writes a sanitized failure detail and the Companion displays it", async () => {
 const script = await source("windows-companion/MEL-ADB-WiFi.ps1");
 const ui = await source("windows-companion/MEL-Companion.cs");
 assert.match(script, /error_detail=/);
 assert.match(script, /ADB_DIAGNOSTIC_FAILED/);
 assert.match(ui, /errorDetailValue/);
 assert.match(ui, /String\.IsNullOrEmpty\(errorDetail\)/);
});

test("Companion ADB refresh does not redirect and leave child stdout/stderr undrained", async () => {
 const native = await source("windows-companion/MEL-Companion.cs");
 const start = native.indexOf("void RefreshAdbDiagnostics()");
 const end = native.indexOf("void RefreshTriadActivity()", start);
 const method = native.slice(start, end);
 assert.match(method, /WaitForExit\(12000\)/);
 assert.match(method, /RedirectStandardOutput = false/);
 assert.match(method, /RedirectStandardError = false/);
 assert.match(method, /process == null/);
});

test("Companion ADB monitor bounds each adb.exe command and cleans temporary output", async () => {
 const script = await source("windows-companion/MEL-ADB-WiFi.ps1");
 const run = script.split("function Run-Adb")[1].split("function Serial")[0];
 assert.match(run, /WaitForExit\(8000\)/);
 assert.match(run, /ADB_COMMAND_TIMEOUT/);
 assert.match(run, /finally/);
 assert.match(run, /Remove-Item -LiteralPath \$stdout,\$stderr/);
 assert.match(run, /RedirectStandardOutput \$stdout/);
 assert.match(run, /RedirectStandardError \$stderr/);
});

test("ADB status publication writes complete JSON before replacing the prior report", async () => {
 const script = await source("windows-companion/MEL-ADB-WiFi.ps1");
 assert.match(script, /function Write-StatusReport/);
 assert.match(script, /\[IO\.File\]::WriteAllText\(\$temp/);
 assert.match(script, /\[IO\.File\]::Replace\(\$temp,\$report,\$null\)/);
 assert.match(script, /Write-StatusReport \$status/);
 assert.doesNotMatch(script, /Remove-Item -LiteralPath \$report -Force/);
});

test("Companion never treats an ADB report older than 75 seconds or far in the future as current", async () => {
 const native = await source("windows-companion/MEL-Companion.cs");
 assert.match(native, /\.TotalSeconds >= -30/);
 assert.match(native, /\.TotalSeconds < 75/);
 assert.doesNotMatch(native, /\.TotalMinutes < 2/);
});

test("ADB monitor sanitizes and bounds diagnostic log error details", async () => {
 const script = await source("windows-companion/MEL-ADB-WiFi.ps1");
 assert.match(script, /pairing\\s\*code\|password\|token\|authorization/);
 assert.match(script, /\[REDACTED\]/);
 assert.match(script, /Substring\(0,\[Math\]::Min\(240/);
});

test("Companion background ADB status shows the recorded failure detail", async () => {
 const native = await source("windows-companion/MEL-Companion.cs");
 const start=native.indexOf("void RefreshAll()");
 const end=native.indexOf("var devices=MelApp.Devices()",start);
 const refresh=native.slice(start,end);
 assert.match(refresh,/error_detail/);
 assert.match(refresh,/String\.IsNullOrEmpty\(errorDetail\)/);
 assert.match(refresh,/\.TotalSeconds >= -30/);
 assert.match(refresh,/\.TotalSeconds < 75/);
 assert.doesNotMatch(refresh,/\.TotalMinutes < 2/);
});

test("Companion background ADB monitor is single-instance while -Once diagnostics remain available", async () => {
 const script = await source("windows-companion/MEL-ADB-WiFi.ps1");
 assert.ok(script.includes('MEL.Companion.AdbWifiMonitor'));
 assert.match(script, /\$monitorMutex\.WaitOne\(0\)/);
 assert.match(script, /if \(-not \$Once\)/);
 assert.match(script, /if \(-not \$ownsMonitorMutex\) \{ exit 0 \}/);
 assert.match(script, /ReleaseMutex\(\)/);
});

test("Manual ADB refresh refuses to display a previous report when the one-shot probe fails", async () => {
 const native = await source("windows-companion/MEL-Companion.cs");
 const start=native.indexOf("void RefreshAdbDiagnostics()");
 const end=native.indexOf("void RefreshTriadActivity()",start);
 const method=native.slice(start,end);
 assert.match(method,/process\.ExitCode != 0/);
 assert.ok(method.indexOf("process.ExitCode != 0") < method.indexOf('string report = Path.Combine'));
 assert.match(method,/diagnostic s’est terminé en erreur/);
});

test("Companion supervisor disposes an exited ADB process handle before restarting the monitor", async () => {
 const native = await source("windows-companion/MEL-Companion.cs");
 const start=native.indexOf("static void StartAdbWifiMonitor()");
 const end=native.indexOf("public static void StopAdbWifiMonitor()",start);
 const method=native.slice(start,end);
 assert.match(method,/AdbWifiProcess\.HasExited/);
 assert.match(method,/AdbWifiProcess\.Dispose\(\)/);
 assert.match(method,/AdbWifiProcess = null/);
 assert.ok(method.indexOf("AdbWifiProcess.Dispose()") < method.indexOf("Process.Start(psi)"));
});

test("Stopping the Companion ADB monitor waits boundedly and always disposes the process handle", async () => {
 const native=await source("windows-companion/MEL-Companion.cs");
 const start=native.indexOf("public static void StopAdbWifiMonitor()");
 const end=native.indexOf("public static void StartBackgroundSupervisor()",start);
 const method=native.slice(start,end);
 assert.match(method,/process\.Kill\(\)/);
 assert.match(method,/process\.WaitForExit\(2000\)/);
 assert.match(method,/finally/);
 assert.match(method,/process\.Dispose\(\)/);
 assert.ok(method.indexOf("AdbWifiProcess = null") < method.indexOf("process.Kill()"));
});

test("Companion writes actionable local status when the background ADB monitor cannot start", async () => {
 const native=await source("windows-companion/MEL-Companion.cs");
 const start=native.indexOf("static void StartAdbWifiMonitor()");
 const end=native.indexOf("public static void StopAdbWifiMonitor()",start);
 const method=native.slice(start,end);
 assert.match(method,/ADB_MONITOR_SCRIPT_MISSING/);
 assert.match(method,/ADB_MONITOR_PROCESS_START_FAILED/);
 assert.match(method,/android-adb-monitor-supervisor\.log/);
 assert.match(method,/\{"connected",false\}/);
 assert.match(method,/\{"error",failure\}/);
});

test("Companion supervisor failure log remains bounded across repeated ADB startup failures", async () => {
 const native=await source("windows-companion/MEL-Companion.cs");
 const start=native.indexOf("static void StartAdbWifiMonitor()");
 const end=native.indexOf("public static void StopAdbWifiMonitor()",start);
 const method=native.slice(start,end);
 assert.match(method,/android-adb-monitor-supervisor\.log/);
 assert.match(method,/256 \* 1024/);
 assert.match(method,/supervisorLog \+ "\.1"/);
 assert.match(method,/File\.AppendAllText\(supervisorLog/);
});

test("Companion dashboard only presents ADB connected when the report is fresh", async () => {
 const native=await source("windows-companion/MEL-Companion.cs");
 const start=native.indexOf("void RefreshAll()");
 const end=native.indexOf("var devices=MelApp.Devices()",start);
 const refresh=native.slice(start,end);
 assert.match(refresh,/bool isConnected = fresh && a\.TryGetValue\("connected"/);
 assert.match(refresh,/\.TotalSeconds < 75/);
});

test("Companion parses ADB report timestamps with invariant UTC semantics", async () => {
 const native=await source("windows-companion/MEL-Companion.cs");
 const start=native.indexOf("void RefreshAll()");
 const end=native.indexOf("var devices=MelApp.Devices()",start);
 const refresh=native.slice(start,end);
 assert.match(refresh,/DateTime\.TryParse\(Convert\.ToString\(observed\), System\.Globalization\.CultureInfo\.InvariantCulture/);
 assert.match(refresh,/DateTimeStyles\.AssumeUniversal \| System\.Globalization\.DateTimeStyles\.AdjustToUniversal/);
 assert.match(refresh,/\.TotalSeconds < 75/);
});
