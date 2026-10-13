# MEL Companion local ADB Wi-Fi monitor -- read-only
[CmdletBinding()]
param([switch]$Once,[ValidateRange(10,600)][int]$IntervalSeconds=30)
$ErrorActionPreference="Stop"
$dir=Join-Path $env:LOCALAPPDATA "MEL"
New-Item -Path $dir -ItemType Directory -Force | Out-Null
$report=Join-Path $dir "android-adb-wifi.json"
$log=Join-Path $dir "android-adb-wifi.log"
$saved=Join-Path $dir "android-adb-last-endpoint.txt"
$adb=@((Join-Path $env:LOCALAPPDATA "Android\platform-tools\adb.exe"),(Join-Path $env:LOCALAPPDATA "Android\Sdk\platform-tools\adb.exe")) | Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } | Select-Object -First 1
if (-not $adb) { $cmd=Get-Command adb.exe -ErrorAction SilentlyContinue; if ($cmd) { $adb=$cmd.Source } }
function Run-Adb([string[]]$arglist) { @(& $adb @arglist 2>&1 | ForEach-Object { [string]$_ }) }
function Serial {
  foreach ($line in (Run-Adb -arglist @("devices","-l"))) {
    if ($line -match '^([^\s]+)\s+device(?:\s|$)') {
      $s=$Matches[1]
      if ($s -match '_adb-tls-connect\._tcp|^\d{1,3}(?:\.\d{1,3}){3}:\d{2,5}$') { return $s }
    }
  }
  return $null
}
function Attempt-Reconnect {
  $targets=@()
  foreach ($line in (Run-Adb -arglist @("mdns","services"))) {
    if ($line -match '_adb-tls-connect\._tcp' -and $line -match '(\d{1,3}(?:\.\d{1,3}){3}:\d{2,5})') { $targets += $Matches[1] }
  }
  if (Test-Path -LiteralPath $saved) {
    $last=(Get-Content -LiteralPath $saved -Raw).Trim()
    if ($last -match '^\d{1,3}(?:\.\d{1,3}){3}:\d{2,5}$') { $targets += $last }
  }
  foreach ($endpoint in ($targets | Select-Object -Unique | Select-Object -First 5)) {
    $null=Run-Adb -arglist @("connect",$endpoint)
    Set-Content -LiteralPath $saved -Value $endpoint -Encoding ASCII
    if (Serial) { break }
  }
}
function Scan {
  $id=Serial
  if (-not $id) { Attempt-Reconnect; $id=Serial }
  $status=[ordered]@{schema="mel.adb-wifi-status.v1";observed_at_utc=(Get-Date).ToUniversalTime().ToString("o");adb_available=[bool]$adb;connected=[bool]$id;serial=$id;android_model=$null;android_version=$null;mel_package="fr.veriteinterdite.mel";mel_installed=$false;mel_version=$null;mel_version_code=$null}
  if ($id) {
    $status.android_model=((Run-Adb -arglist @("-s",$id,"shell","getprop","ro.product.model")) -join " ").Trim()
    $status.android_version=((Run-Adb -arglist @("-s",$id,"shell","getprop","ro.build.version.release")) -join " ").Trim()
    $packages=(Run-Adb -arglist @("-s",$id,"shell","pm","list","packages","fr.veriteinterdite.mel")) -join "`n"
    $status.mel_installed=[bool]($packages -match '(?m)^package:fr\.veriteinterdite\.mel\s*$')
    if ($status.mel_installed) {
      $details=(Run-Adb -arglist @("-s",$id,"shell","dumpsys","package","fr.veriteinterdite.mel")) -join "`n"
      if ($details -match 'versionName=([^\s]+)') { $status.mel_version=$Matches[1] }
      if ($details -match 'versionCode=(\d+)') { $status.mel_version_code=[int64]$Matches[1] }
    }
  }
  $temp="$report.tmp"
  [IO.File]::WriteAllText($temp,($status | ConvertTo-Json -Depth 5),(New-Object Text.UTF8Encoding($false)))
  if (Test-Path -LiteralPath $report) { Remove-Item -LiteralPath $report -Force }
  Move-Item -LiteralPath $temp -Destination $report -Force
  Add-Content -LiteralPath $log -Encoding UTF8 -Value ("{0} connected={1} model={2} mel_installed={3}" -f $status.observed_at_utc,$status.connected,$status.android_model,$status.mel_installed)
}
do {
  try {
    if (-not $adb) {
      $status=[ordered]@{schema="mel.adb-wifi-status.v1";observed_at_utc=(Get-Date).ToUniversalTime().ToString("o");adb_available=$false;connected=$false;serial=$null;android_model=$null;android_version=$null;mel_package="fr.veriteinterdite.mel";mel_installed=$false;mel_version=$null;mel_version_code=$null;error="ADB_PLATFORM_TOOLS_MISSING"}
      [IO.File]::WriteAllText("$report.tmp",($status | ConvertTo-Json -Depth 5),(New-Object Text.UTF8Encoding($false)))
      Move-Item -LiteralPath "$report.tmp" -Destination $report -Force
    } else { Scan }
  } catch {
    $reason=$_.Exception.Message
    $status=[ordered]@{schema="mel.adb-wifi-status.v1";observed_at_utc=(Get-Date).ToUniversalTime().ToString("o");adb_available=[bool]$adb;connected=$false;serial=$null;android_model=$null;android_version=$null;mel_package="fr.veriteinterdite.mel";mel_installed=$false;mel_version=$null;mel_version_code=$null;error="ADB_DIAGNOSTIC_FAILED"}
    try {
      [IO.File]::WriteAllText("$report.tmp",($status | ConvertTo-Json -Depth 5),(New-Object Text.UTF8Encoding($false)))
      Move-Item -LiteralPath "$report.tmp" -Destination $report -Force
    } catch { }
    Add-Content -LiteralPath $log -Encoding UTF8 -Value ("{0} error={1}" -f (Get-Date).ToUniversalTime().ToString("o"),$reason)
  }
  if (-not $Once) { Start-Sleep -Seconds $IntervalSeconds }
} while (-not $Once)
