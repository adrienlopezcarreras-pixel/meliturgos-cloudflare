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
