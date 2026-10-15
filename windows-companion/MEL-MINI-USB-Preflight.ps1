param(
  [Parameter(Mandatory=$true)][ValidatePattern('^COM[0-9]{1,3}$')][string]$Port
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

# This helper is launched by the owner locally, not by MEL's remote relay.
# Connecting to the bootloader can reset the USB board. It never writes flash.
Write-Host 'MEL MINI — contrôle USB local en lecture seule.'
Write-Host 'La connexion au bootloader peut redémarrer la MINI.'
Write-Host 'Une sauvegarde et une vérification matérielle resteront nécessaires avant flash.'
$approval = Read-Host 'Tapez exactement AUTORISER_LECTURE_USB_MINI pour continuer'
if ($approval -cne 'AUTORISER_LECTURE_USB_MINI') {
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
$launcher = Get-Command -Name 'py.exe' -ErrorAction SilentlyContinue | Select-Object -First 1
$pythonArgs = @()
if ($null -ne $launcher) {
  $pythonArgs = @('-3')
} else {
  $launcher = Get-Command -Name 'python.exe' -ErrorAction SilentlyContinue | Select-Object -First 1
}
if ($null -eq $launcher) {
  throw 'MINI_USB_PYTHON_REQUIRED'
}

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
& $launcher.Source @arguments
if ($LASTEXITCODE -ne 0) {
  Write-Warning "Précontrôle refusé. Examiner le rapport local si présent : $output"
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
