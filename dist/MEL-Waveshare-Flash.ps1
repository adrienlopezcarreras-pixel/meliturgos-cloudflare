$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Security

function Read-Plain([Security.SecureString]$secure) {
  $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
}

Write-Host ""
Write-Host "=== MEL · Flash Waveshare ESP32-S3 3.5 C ===" -ForegroundColor Cyan
Write-Host "Branche la carte directement au PC avec un câble USB-C qui transporte les données."
Write-Host ""

$defaultServer = "https://meliturgos.adrien-lopezcarreras.workers.dev"
$server = Read-Host "Adresse MEL [$defaultServer]"
if ([string]::IsNullOrWhiteSpace($server)) { $server = $defaultServer }
$server = $server.TrimEnd("/")

$defaultUser = "adrien"
$user = Read-Host "Utilisateur MEL [$defaultUser]"
if ([string]::IsNullOrWhiteSpace($user)) { $user = $defaultUser }
$secure = Read-Host "Mot de passe MEL (utilisé uniquement pour télécharger le firmware)" -AsSecureString
$pass = Read-Plain $secure

try {
  $raw = [Text.Encoding]::UTF8.GetBytes($user + ":" + $pass)
  $headers = @{ Authorization = "Basic " + [Convert]::ToBase64String($raw) }

  Write-Host "Vérification du firmware publié..." -ForegroundColor Yellow
  $info = Invoke-RestMethod -Uri "$server/api/device/v1/firmware-info" -Headers $headers -TimeoutSec 30
  if (-not $info.ok -or $info.firmware.available -ne $true) {
    throw "Le firmware MEL n'est pas encore publié sur le serveur."
  }

  $work = Join-Path $env:TEMP "MEL-Waveshare"
  New-Item -ItemType Directory -Force -Path $work | Out-Null
  $bin = Join-Path $work "mel-terminal.bin"

  Write-Host "Téléchargement MEL $($info.firmware.version)..." -ForegroundColor Yellow
  Invoke-WebRequest -Uri "$server/api/device/v1/firmware" -Headers $headers -UseBasicParsing -OutFile $bin -TimeoutSec 120

  if ($info.firmware.sha256) {
    $actual = (Get-FileHash -Algorithm SHA256 $bin).Hash.ToLowerInvariant()
    $expected = ([string]$info.firmware.sha256).ToLowerInvariant()
    if ($actual -ne $expected) { throw "Empreinte SHA256 invalide. Flashage annulé." }
    Write-Host "Firmware vérifié : SHA256 OK." -ForegroundColor Green
  }

  $python = $null
  foreach ($candidate in @("py.exe","python.exe","python3.exe")) {
    $cmd = Get-Command $candidate -ErrorAction SilentlyContinue
    if ($cmd) { $python = $cmd.Source; break }
  }

  if (-not $python) {
    $winget = Get-Command winget.exe -ErrorAction SilentlyContinue
    if (-not $winget) { throw "Python absent et winget indisponible. Installe Python 3 puis relance ce script." }
    Write-Host "Installation de Python pour l'outil de flash..." -ForegroundColor Yellow
    & $winget.Source install --id Python.Python.3.12 -e --scope user --accept-package-agreements --accept-source-agreements
    $known = Join-Path $env:LOCALAPPDATA "ProgramsPythonPython312python.exe"
    if (Test-Path $known) { $python = $known }
    if (-not $python) { throw "Python vient d'être installé. Ferme puis relance ce script une fois." }
  }

  Write-Host "Préparation d'esptool..." -ForegroundColor Yellow
  if ([IO.Path]::GetFileName($python).ToLowerInvariant() -eq "py.exe") {
    & $python -3 -m pip install --user --disable-pip-version-check "esptool==4.8.1" | Out-Host
    $pyArgs = @("-3")
  } else {
    & $python -m pip install --user --disable-pip-version-check "esptool==4.8.1" | Out-Host
    $pyArgs = @()
  }

  $ports = @(Get-CimInstance Win32_SerialPort -ErrorAction SilentlyContinue | Select-Object -ExpandProperty DeviceID)
  if ($ports.Count -eq 0) {
    Write-Host ""
    Write-Host "Aucun port détecté." -ForegroundColor Yellow
    Write-Host "Maintiens BOOT sur la Waveshare, branche l'USB-C au PC, relâche BOOT, puis appuie sur Entrée."
    Read-Host | Out-Null
    $ports = @(Get-CimInstance Win32_SerialPort -ErrorAction SilentlyContinue | Select-Object -ExpandProperty DeviceID)
  }
  if ($ports.Count -eq 0) { throw "Toujours aucun port série/USB détecté." }

  if ($ports.Count -eq 1) {
    $port = $ports[0]
  } else {
    Write-Host "Ports détectés : $($ports -join ', ')"
    $port = Read-Host "Port de la Waveshare (ex: COM7)"
    if ([string]::IsNullOrWhiteSpace($port)) { throw "Port requis." }
  }

  Write-Host ""
  Write-Host "Effacement propre de la mémoire flash..." -ForegroundColor Yellow
  & $python @pyArgs -m esptool --chip esp32s3 --port $port erase_flash
  if ($LASTEXITCODE -ne 0) { throw "Échec de l'effacement. Essaie en maintenant BOOT pendant la connexion." }

  Write-Host "Flashage du firmware MEL..." -ForegroundColor Yellow
  & $python @pyArgs -m esptool --chip esp32s3 --port $port --baud 460800 write_flash 0x0 $bin
  if ($LASTEXITCODE -ne 0) { throw "Échec du flashage." }

  Write-Host ""
  Write-Host "Firmware MEL installé." -ForegroundColor Green
  Write-Host "Débranche/rebranche ou appuie sur RESET."
  Write-Host "MINI démarre directement sur son interface tactile."
  Write-Host "Choisis le Wi-Fi sur MINI, saisis le mot de passe à l'écran, puis crée un code dans MEL > MINI et saisis-le sur MINI."
}
finally {
  $pass = $null
  $secure = $null
}
