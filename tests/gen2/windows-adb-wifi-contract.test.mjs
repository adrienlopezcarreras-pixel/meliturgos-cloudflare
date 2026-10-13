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
  assert.match(script, /Move-Item -LiteralPath "\$report\.tmp" -Destination \$report -Force/);
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
