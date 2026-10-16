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
function Write-AdbLog([string]$message) {
  # Keep the long-running background monitor's log bounded (current + one backup).
  try {
    if (Test-Path -LiteralPath $log -PathType Leaf) {
      $info = Get-Item -LiteralPath $log
      if ($info.Length -ge 1MB) {
        $backup = "$log.1"
        if (Test-Path -LiteralPath $backup) { Remove-Item -LiteralPath $backup -Force }
        Move-Item -LiteralPath $log -Destination $backup
      }
    }
    Add-Content -LiteralPath $log -Encoding UTF8 -Value $message
  } catch { }
}
function Run-Adb([string[]]$arglist) {
  $output=@(& $adb @arglist 2>&1 | ForEach-Object { [string]$_ })
  if ($LASTEXITCODE -ne 0) { throw ("ADB_COMMAND_FAILED exit={0}" -f $LASTEXITCODE) }
  return $output
}
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
  try { $discovered=Run-Adb -arglist @("mdns","services") } catch { $discovered=@() }
  foreach ($line in $discovered) {
    if ($line -match '_adb-tls-connect\._tcp' -and $line -match '(\d{1,3}(?:\.\d{1,3}){3}:\d{2,5})') { $targets += $Matches[1] }
  }
  if (Test-Path -LiteralPath $saved) {
    try { $last=(Get-Content -LiteralPath $saved -Raw).Trim() } catch { $last="" }
    if ($last -match '^\d{1,3}(?:\.\d{1,3}){3}:\d{2,5}$') { $targets = @($last) + @($targets) }
  }
  foreach ($endpoint in ($targets | Select-Object -Unique | Select-Object -First 5)) {
    try { $result=(Run-Adb -arglist @("connect",$endpoint)) -join "`n" } catch { continue }
    if ($result -match "(?i)(?:connected to|already connected to)\s+" -and $result -notmatch "(?i)(?:failed|unable|refused)") {
      try { $serials=(Run-Adb -arglist @("devices","-l")) -join "`n" } catch { continue }
      if ($serials -match "(?m)^$([regex]::Escape($endpoint))\s+device(?:\s|$)") {
        try { Set-Content -LiteralPath $saved -Value $endpoint -Encoding ASCII } catch { }
        break
      }
    }
  }
}
function Scan {
  $id=Serial
  if (-not $id) { Attempt-Reconnect; $id=Serial }
  $status=[ordered]@{schema="mel.adb-wifi-status.v1";observed_at_utc=(Get-Date).ToUniversalTime().ToString("o");adb_available=[bool]$adb;connected=[bool]$id;serial=$id;android_model=$null;android_version=$null;mel_package="fr.veriteinterdite.mel";mel_installed=$false;mel_version=$null;mel_version_code=$null}
  if ($id) {
    $status.android_model=((Run-Adb -arglist @("-s",$id,"shell","getprop","ro.product.model")) -join " ").Trim()
    $status.android_version=((Run-Adb -arglist @("-s",$id,"shell","getprop","ro.build.version.release")) -join " ").Trim()
    if ([string]::IsNullOrWhiteSpace($status.android_model) -or [string]::IsNullOrWhiteSpace($status.android_version) -or $status.android_model -match "(?i)^(error|device offline|unauthorized)" -or $status.android_version -match "(?i)^(error|device offline|unauthorized)") { throw "ADB_DEVICE_IDENTITY_UNVERIFIED" }
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
  Write-AdbLog ("{0} connected={1} model={2} mel_installed={3}" -f $status.observed_at_utc,$status.connected,$status.android_model,$status.mel_installed)
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
    $status=[ordered]@{schema="mel.adb-wifi-status.v1";observed_at_utc=(Get-Date).ToUniversalTime().ToString("o");adb_available=[bool]$adb;connected=$false;serial=$null;android_model=$null;android_version=$null;mel_package="fr.veriteinterdite.mel";mel_installed=$false;mel_version=$null;mel_version_code=$null;error="ADB_DIAGNOSTIC_FAILED";error_detail=([string]$reason -replace "[\r\n\t]+"," ").Substring(0,[Math]::Min(240,([string]($reason -replace "[\r\n\t]+"," ")).Length))}
    try {
      [IO.File]::WriteAllText("$report.tmp",($status | ConvertTo-Json -Depth 5),(New-Object Text.UTF8Encoding($false)))
      Move-Item -LiteralPath "$report.tmp" -Destination $report -Force
    } catch { }
    Write-AdbLog ("{0} error={1}" -f (Get-Date).ToUniversalTime().ToString("o"),$reason)
  }
  if (-not $Once) { Start-Sleep -Seconds $IntervalSeconds }
} while (-not $Once)
