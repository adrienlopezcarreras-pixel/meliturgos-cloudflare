param(
  [Parameter(Mandatory=$true)][ValidatePattern('^COM[0-9]{1,3}$')][string]$Port,
  [string]$Approval = ''
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

Write-Host 'MEL MINI - sauvegarde USB INTEGRALE, en lecture seule.'
Write-Host 'La liaison au bootloader peut redemarrer la MINI.'
Write-Host 'La sauvegarde contient potentiellement des secrets Wi-Fi et des donnees NVS : ne la partagez pas.'
if ([string]::IsNullOrWhiteSpace($Approval)) {
  $Approval = Read-Host 'Tapez exactement SAUVEGARDER_MINI_USB pour continuer'
}
if ($Approval -cne 'SAUVEGARDER_MINI_USB') { throw 'MINI_BACKUP_OWNER_CONFIRMATION_REQUIRED' }

$port = $Port.ToUpperInvariant()
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
if (!(Test-Path -LiteralPath (Join-Path $root 'local_readonly_preflight.py'))) {
  throw 'MINI_USB_PREFLIGHT_MISSING'
}
$ports = @([IO.Ports.SerialPort]::GetPortNames())
if ($ports -notcontains $port) { throw "MINI_PORT_NOT_FOUND:$port" }
$pnp = @(Get-CimInstance Win32_PnPEntity -ErrorAction Stop | Where-Object {
  ([string]$_.Name) -like ('*(' + $port + ')*') -and
  ([string]$_.PNPDeviceID) -match '^USB\\VID_303A&PID_1001'
})
if ($pnp.Count -ne 1) { throw 'MINI_ESPRESSIF_USB_ID_NOT_CONFIRMED' }

# Use the interpreter on this PC that demonstrably runs esptool.
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
$launcher = $null
$pythonArgs = @()
foreach ($candidate in $candidates) {
  try {
    $probeLauncher = $candidate[0]
    $probeArgs = @($candidate[1])
    $probeOutput = & $probeLauncher.Source @probeArgs -m esptool version 2>&1
    if ($LASTEXITCODE -eq 0) {
      $launcher = $probeLauncher
      $pythonArgs = $probeArgs
      break
    }
  } catch { }
}
if ($null -eq $launcher) { throw 'MINI_BACKUP_ESPTOOL_NOT_AVAILABLE' }

$parent = Join-Path $env:LOCALAPPDATA 'MEL\mini-full-backups'
[IO.Directory]::CreateDirectory($parent) | Out-Null
$id = [Guid]::NewGuid().ToString('N')
$destination = Join-Path $parent $id
[IO.Directory]::CreateDirectory($destination) | Out-Null
$preflightDir = Join-Path $destination 'preflight'
$first = Join-Path $destination 'full-flash.bin'
$second = Join-Path $destination 'full-flash-verify.bin'
$manifest = Join-Path $destination 'backup.json'
$startedAt = (Get-Date).ToUniversalTime().ToString('o')
$success = $false
try {
  Write-Host 'Etape 1/4 : verification de la table et des metadonnees OTA.'
  & $launcher.Source @pythonArgs (Join-Path $root 'local_readonly_preflight.py') --port $port --output $preflightDir --ack-bootloader
  if ($LASTEXITCODE -ne 0) { throw 'MINI_BACKUP_PREFLIGHT_FAILED' }
  $proofPath = Join-Path $preflightDir 'preflight.json'
  if (!(Test-Path -LiteralPath $proofPath -PathType Leaf)) { throw 'MINI_BACKUP_PREFLIGHT_EVIDENCE_MISSING' }
  $proof = Get-Content -LiteralPath $proofPath -Raw -Encoding UTF8 | ConvertFrom-Json
  if ($proof.partition_valid -ne $true -or $proof.ota_metadata_unambiguous -ne $true -or
      $proof.flash_allowed -ne $false -or $proof.flash_performed -ne $false) {
    throw 'MINI_BACKUP_PREFLIGHT_INVALID'
  }
  Write-Host 'Etape 2/4 : verification de la capacite physique de la flash.'
  $info = (& $launcher.Source @pythonArgs -m esptool --chip esp32s3 --port $port flash-id 2>&1 | Out-String)
  if ($LASTEXITCODE -ne 0) { throw 'MINI_BACKUP_FLASH_ID_FAILED' }
  if ($info -notmatch '(?im)Detected flash size:\s*(\d+)\s*MB') {
    throw 'MINI_BACKUP_FLASH_SIZE_UNKNOWN'
  }
  $megabytes = [int]$Matches[1]
  if ($megabytes -notin @(8,16,32)) { throw "MINI_BACKUP_UNSUPPORTED_CAPACITY:$megabytes" }
  [long]$size = [long]$megabytes * 1024 * 1024
  $offset='0x0'
  $length = '0x{0:x}' -f $size
  Write-Host "Flash $megabytes MB detectee. Sauvegarde dans $destination"
  Write-Host 'Etape 3/4 : lecture integrale de la flash. Ne debranchez pas la MINI.'
  & $launcher.Source @pythonArgs -m esptool --chip esp32s3 --port $port --before default-reset --after hard-reset read-flash $offset $length $first
  if ($LASTEXITCODE -ne 0) { throw 'MINI_BACKUP_READ_FAILED' }
  if (!(Test-Path -LiteralPath $first -PathType Leaf) -or (Get-Item -LiteralPath $first).Length -ne $size) {
    throw 'MINI_BACKUP_SIZE_MISMATCH'
  }
  Write-Host 'Etape 4/4 : seconde lecture et comparaison cryptographique.'
  & $launcher.Source @pythonArgs -m esptool --chip esp32s3 --port $port --before default-reset --after hard-reset read-flash $offset $length $second
  if ($LASTEXITCODE -ne 0) { throw 'MINI_BACKUP_VERIFY_READ_FAILED' }
  if (!(Test-Path -LiteralPath $second -PathType Leaf) -or (Get-Item -LiteralPath $second).Length -ne $size) {
    throw 'MINI_BACKUP_VERIFY_SIZE_MISMATCH'
  }
  $sha = (Get-FileHash -LiteralPath $first -Algorithm SHA256).Hash.ToLowerInvariant()
  $shaVerify = (Get-FileHash -LiteralPath $second -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($sha -ne $shaVerify) { throw 'MINI_BACKUP_DOUBLE_READ_HASH_MISMATCH' }
  # Keep one canonical, double-read-verified backup. No firmware change.
  Remove-Item -LiteralPath $second -Force
  $record = [ordered]@{
    schema='mel.mini.full-flash-backup/v1'
    success=$true
    port=$port
    capacity_bytes=$size
    flash_sha256=$sha
    flash_file=$first
    preflight_file=$proofPath
    selected_boot_slot_from_metadata=$proof.ota_slot_from_metadata
    running_slot_verified_on_device=$false
    restore_proven=$false
    flash_allowed=$false
    flash_performed=$false
    contains_private_nvs=$true
    started_at=$startedAt
    finished_at=(Get-Date).ToUniversalTime().ToString('o')
  }
  $record | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $manifest -Encoding UTF8
  $success = $true
  Write-Host "SAUVEGARDE VERIFIEE : $first" -ForegroundColor Green
  Write-Host "SHA-256 : $sha" -ForegroundColor Green
  Write-Host "Rapport : $manifest"
  Write-Host 'FLASH TOUJOURS BLOQUE jusqu a preuve de restauration et firmware qualifie.'
}
finally {
  if (-not $success) {
    Write-Warning "Sauvegarde non validee. Gardez les preuves d'echec : $destination"
  }
}
