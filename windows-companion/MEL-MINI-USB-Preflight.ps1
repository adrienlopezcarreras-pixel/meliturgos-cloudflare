param(
  [Parameter(Mandatory=$true)][ValidatePattern('^COM[0-9]{1,3}$')][string]$Port,
  [string]$Approval = ''
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

# This helper is launched by the owner locally, not by MEL's remote relay.
# Connecting to the bootloader can reset the USB board. It never writes flash.
Write-Host 'MEL MINI — contrôle USB local en lecture seule.'
Write-Host 'La connexion au bootloader peut redémarrer la MINI.'
Write-Host 'Une sauvegarde et une vérification matérielle resteront nécessaires avant flash.'
if ([string]::IsNullOrWhiteSpace($Approval)) {
  try {
    $Approval = Read-Host 'Tapez exactement AUTORISER_LECTURE_USB_MINI pour continuer'
  } catch {
    throw 'MINI_USB_LOCAL_CONFIRMATION_REQUIRED'
  }
}
if ($Approval -cne 'AUTORISER_LECTURE_USB_MINI') {
  throw 'MINI_USB_LOCAL_CONFIRMATION_REQUIRED'
}

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$required = @(
  'local_readonly_preflight.py',
  'inspect_partitions.py',
  'inspect_ota_state.py',
  'inspect_image.py'
)
foreach ($name in $required) {
  $file = Join-Path $root $name
  if (!(Test-Path -LiteralPath $file -PathType Leaf)) {
    throw "MINI_USB_PREFLIGHT_MODULE_MISSING:$name"
  }
}
# Prefer a Python interpreter that can actually import esptool. A bare
# "py -3" may select an unsupported newer Python (e.g. 3.15), even when
# Python 3.13 and esptool are already installed and working.
$launcher = $null
$pythonArgs = @()
$py = Get-Command -Name 'py.exe' -ErrorAction SilentlyContinue | Select-Object -First 1
$python = Get-Command -Name 'python.exe' -ErrorAction SilentlyContinue | Select-Object -First 1
$candidates = @()
if ($null -ne $py) {
  foreach ($version in @('3.13','3.12','3.11','3.10','3.14','3.15')) {
    $candidates += ,@($py, @("-$version"))
  }
  $candidates += ,@($py, @('-3'))
}
if ($null -ne $python) { $candidates += ,@($python, @()) }
foreach ($candidate in $candidates) {
  $probeLauncher = $candidate[0]
  $probeArgs = @($candidate[1])
  try {
    $probeOutput = & $probeLauncher.Source @probeArgs -m esptool version 2>&1
    if ($LASTEXITCODE -eq 0) {
      $launcher = $probeLauncher
      $pythonArgs = $probeArgs
      break
    }
  } catch { }
}
if ($null -eq $launcher) {
  throw 'MINI_USB_ESPTOOL_REQUIRED: install esptool in a supported Python (e.g. py -3.13 -m pip install esptool)'
}
Write-Host ("Python/esptool validé : " + $launcher.Source + " " + ($pythonArgs -join ' '))

# Evidence is unique per run; never reuse or overwrite a previous USB dump.
$evidenceRoot = Join-Path $env:LOCALAPPDATA 'MEL\mini-usb-evidence'
[IO.Directory]::CreateDirectory($evidenceRoot) | Out-Null
$output = Join-Path $evidenceRoot ([Guid]::NewGuid().ToString('N'))
$arguments = @($pythonArgs) + @(
  (Join-Path $root 'local_readonly_preflight.py'),
  '--port', $Port.ToUpperInvariant(),
  '--output', $output,
  '--ack-bootloader'
)
# Windows PowerShell 5.1 must parse this UTF-8 source with BOM and send UTF-8 to child tools.
try { [Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false) } catch { }
$OutputEncoding = New-Object System.Text.UTF8Encoding($false)
& $launcher.Source @arguments
if ($LASTEXITCODE -ne 0) {
  $report = Join-Path $output 'preflight.json'
  Write-Warning "Preflight was refused. Local evidence folder: $output"
  if (Test-Path -LiteralPath $report -PathType Leaf) {
    try {
      $failedProof = Get-Content -LiteralPath $report -Encoding UTF8 -Raw | ConvertFrom-Json
      if ($failedProof.error) { Write-Host ("Reason: " + $failedProof.error) -ForegroundColor Yellow }

      # Surface the actual failed esptool probe locally; the summary error alone
      # is not enough to distinguish a wrong COM port, busy port, cable issue or bootloader timeout.
      foreach ($probeName in @('chip_id','flash_id','partition_readback','ota_readback')) {
        $probeProperty = $failedProof.PSObject.Properties[$probeName]
        if ($null -eq $probeProperty) { continue }
        $probe = $probeProperty.Value
        if ($null -eq $probe -or $null -eq $probe.exit_code -or [int]$probe.exit_code -eq 0) { continue }
        Write-Host ("Failed probe: {0} (exit code {1})" -f $probeName,$probe.exit_code) -ForegroundColor Yellow
        foreach ($streamName in @('stdout','stderr','error')) {
          $streamProperty = $probe.PSObject.Properties[$streamName]
          if ($null -eq $streamProperty) { continue }
          $detail = [string]$streamProperty.Value
          if (-not [string]::IsNullOrWhiteSpace($detail)) {
            $detail = $detail.Trim()
            if ($detail.Length -gt 1600) { $detail = $detail.Substring(0,1600) + ' [truncated]' }
            Write-Host ("  {0}: {1}" -f $streamName,$detail) -ForegroundColor Gray
          }
        }
      }
      Write-Host ("Partition table valid: " + [string]$failedProof.partition_valid)
      Write-Host ("OTA metadata unambiguous: " + [string]$failedProof.ota_metadata_unambiguous)
      Write-Host ("Running slot verified on device: " + [string]$failedProof.running_slot_verified_on_device)
      Write-Host "Flash allowed: False"
      Write-Host "Next proof required: LIVE_RUNNING_SLOT_SECURITY_BACKUP_AND_RECOVERY"
    } catch {
      Write-Warning "Evidence JSON exists but could not be parsed. Keep the folder for diagnosis."
    }
  } else {
    Write-Warning "No preflight.json was written. Keep the evidence folder for diagnosis."
  }
  throw "MINI_USB_PREFLIGHT_FAILED:$LASTEXITCODE"
}
$report = Join-Path $output 'preflight.json'
if (!(Test-Path -LiteralPath $report -PathType Leaf)) { throw 'MINI_USB_PREFLIGHT_EVIDENCE_MISSING' }
$proof = Get-Content -LiteralPath $report -Encoding UTF8 -Raw | ConvertFrom-Json
if ($proof.schema -ne 'mel-mini-live-readonly-preflight/v2' -or
    $proof.flash_allowed -ne $false -or
    $proof.flash_performed -ne $false -or
    $proof.running_slot_verified_on_device -ne $false -or
    $proof.partition_valid -ne $true -or
    $proof.ota_metadata_unambiguous -ne $true) {
  throw 'MINI_USB_PREFLIGHT_EVIDENCE_INCOMPLETE'
}
Write-Host "Rapport USB sauvegardé : $report"
Write-Host 'FLASHAGE TOUJOURS BLOQUÉ : slot en exécution, sécurité et restauration non prouvés.'
