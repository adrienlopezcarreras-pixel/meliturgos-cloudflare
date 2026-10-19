param(
  [Parameter(Mandatory=$true)][ValidatePattern('^COM[0-9]{1,3}$')][string]$Port,
  [Parameter(Mandatory=$true)][string]$FirmwarePath,
  [Parameter(Mandatory=$true)][string]$InactiveOffset,
  [switch]$ConfirmedByCompanion,
  [switch]$AllowOtadataBlank
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

if (-not $ConfirmedByCompanion) { throw 'CONFIRMATION_REQUIRED' }
# Enforce the same approved image and a strictly formatted OTA address locally.
# GUI checks alone are insufficient if the script is accidentally invoked directly.
$approvedSha = '835bd51f438d5465e30955a6783cf34fb8b2d95e2a98ee6f33f04ea406b1d172'
if (-not (Test-Path -LiteralPath $FirmwarePath -PathType Leaf)) { throw 'MINI_FIRMWARE_MISSING' }
$firmwareItem = Get-Item -LiteralPath $FirmwarePath
if ($firmwareItem.Length -lt 65536 -or $firmwareItem.Length -gt 0x600000) { throw 'MINI_FIRMWARE_SIZE_INVALID' }
if ((Get-FileHash -LiteralPath $FirmwarePath -Algorithm SHA256).Hash.ToLowerInvariant() -cne $approvedSha) {
  throw 'MINI_FIRMWARE_SHA256_MISMATCH'
}
if ($InactiveOffset -cnotmatch '^0x[0-9a-fA-F]{5,8}

# Discover esptool-capable Python (same logic as preflight)
$launcher = $null
$pythonArgs = @()
$py = Get-Command -Name 'py.exe' -ErrorAction SilentlyContinue | Select-Object -First 1
$python = Get-Command -Name 'python.exe' -ErrorAction SilentlyContinue | Select-Object -First 1
$candidates = @()
if ($null -ne $py) {
  foreach ($version in @('3.13','3.12','3.11','3.10','3.14','3.15')) { $candidates += ,@($py, @("-$version")) }
  $candidates += ,@($py, @('-3'))
}
if ($null -ne $python) { $candidates += ,@($python, @()) }
foreach ($candidate in $candidates) {
  $probeLauncher = $candidate[0]
  $probeArgs = @($candidate[1])
  try {
    $probeOutput = & $probeLauncher.Source @probeArgs -m esptool version 2>&1
    if ($LASTEXITCODE -eq 0) { $launcher = $probeLauncher; $pythonArgs = $probeArgs; break }
  } catch { }
}
if ($null -eq $launcher) { throw 'ESPTOOL_REQUIRED' }

# Write only to the inactive OTA slot. NVS, storage, bootloader untouched.
# otadata is left unchanged by default. Blanking it forces selection of the new slot
# but is unsafe if the running slot is not independently proven. Require explicit switch.
$common = @($pythonArgs) + @('-m','esptool','--chip','esp32s3','--port',$Port.ToUpperInvariant(),'--baud','460800','--before','default_reset','--after','hard_reset')
$writeArgs = $common + @('write_flash', $InactiveOffset, $FirmwarePath)

if ($AllowOtadataBlank) {
  $blank = Join-Path $env:TEMP 'mel-otadata-blank.bin'
  [byte[]]$ff = @(0xFF) * 8192
  [IO.File]::WriteAllBytes($blank, $ff)
  $writeArgs += @('0xF000', $blank)
  Write-Host 'OTADATA_BLANK_REQUESTED: will erase otadata after writing inactive slot.'
} else {
  Write-Host 'OTADATA_PRESERVED: only inactive slot will be written. Activation requires a later verified step.'
}

& $launcher.Source @writeArgs
if ($LASTEXITCODE -ne 0) { throw "FLASH_FAILED:$LASTEXITCODE" }

if ($AllowOtadataBlank) {
  Write-Host 'FLASH_OK: inactive slot written, otadata blanked, board restarted.'
} else {
  Write-Host 'FLASH_OK: inactive slot written only. otadata unchanged. Board restarted.'
  Write-Host 'New firmware is present but not yet selected. Verify running slot before any activation.'
}
Write-Host 'Verify reconnection and version after reboot.'
) { throw 'MINI_OTA_OFFSET_INVALID' }
$offsetNumber = [Convert]::ToInt64($InactiveOffset.Substring(2),16)
if ($offsetNumber -lt 0x20000 -or ($offsetNumber % 0x10000) -ne 0 -or
    ($offsetNumber + $firmwareItem.Length) -gt 0x1000000) { throw 'MINI_OTA_OFFSET_OUT_OF_BOUNDS' }


# Discover esptool-capable Python (same logic as preflight)
$launcher = $null
$pythonArgs = @()
$py = Get-Command -Name 'py.exe' -ErrorAction SilentlyContinue | Select-Object -First 1
$python = Get-Command -Name 'python.exe' -ErrorAction SilentlyContinue | Select-Object -First 1
$candidates = @()
if ($null -ne $py) {
  foreach ($version in @('3.13','3.12','3.11','3.10','3.14','3.15')) { $candidates += ,@($py, @("-$version")) }
  $candidates += ,@($py, @('-3'))
}
if ($null -ne $python) { $candidates += ,@($python, @()) }
foreach ($candidate in $candidates) {
  $probeLauncher = $candidate[0]
  $probeArgs = @($candidate[1])
  try {
    $probeOutput = & $probeLauncher.Source @probeArgs -m esptool version 2>&1
    if ($LASTEXITCODE -eq 0) { $launcher = $probeLauncher; $pythonArgs = $probeArgs; break }
  } catch { }
}
if ($null -eq $launcher) { throw 'ESPTOOL_REQUIRED' }

# Write only to the inactive OTA slot. NVS, storage, bootloader untouched.
# otadata is left unchanged by default. Blanking it forces selection of the new slot
# but is unsafe if the running slot is not independently proven. Require explicit switch.
$common = @($pythonArgs) + @('-m','esptool','--chip','esp32s3','--port',$Port.ToUpperInvariant(),'--baud','460800','--before','default_reset','--after','hard_reset')
$writeArgs = $common + @('write_flash', $InactiveOffset, $FirmwarePath)

if ($AllowOtadataBlank) {
  $blank = Join-Path $env:TEMP 'mel-otadata-blank.bin'
  [byte[]]$ff = @(0xFF) * 8192
  [IO.File]::WriteAllBytes($blank, $ff)
  $writeArgs += @('0xF000', $blank)
  Write-Host 'OTADATA_BLANK_REQUESTED: will erase otadata after writing inactive slot.'
} else {
  Write-Host 'OTADATA_PRESERVED: only inactive slot will be written. Activation requires a later verified step.'
}

& $launcher.Source @writeArgs
if ($LASTEXITCODE -ne 0) { throw "FLASH_FAILED:$LASTEXITCODE" }

if ($AllowOtadataBlank) {
  Write-Host 'FLASH_OK: inactive slot written, otadata blanked, board restarted.'
} else {
  Write-Host 'FLASH_OK: inactive slot written only. otadata unchanged. Board restarted.'
  Write-Host 'New firmware is present but not yet selected. Verify running slot before any activation.'
}
Write-Host 'Verify reconnection and version after reboot.'
