$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Security

function Read-PlainFromSecure([Security.SecureString]$secure) {
  $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
}

function Protect-Text([string]$value) {
  $plain = [Text.Encoding]::UTF8.GetBytes($value)
  $cipher = [Security.Cryptography.ProtectedData]::Protect(
    $plain,
    $null,
    [Security.Cryptography.DataProtectionScope]::CurrentUser
  )
  return [Convert]::ToBase64String($cipher)
}

Write-Host ""
Write-Host "=== Installation du compagnon ordinateur MEL ===" -ForegroundColor Cyan
Write-Host "Aucun droit administrateur n'est requis."
Write-Host ""

$defaultServer = "https://meliturgos.adrien-lopezcarreras.workers.dev"
$server = Read-Host "Adresse de MEL [$defaultServer]"
if ([string]::IsNullOrWhiteSpace($server)) { $server = $defaultServer }
$server = $server.TrimEnd("/")

$defaultUser = "adrien"
$user = Read-Host "Utilisateur MEL [$defaultUser]"
if ([string]::IsNullOrWhiteSpace($user)) { $user = $defaultUser }

$secure = Read-Host "Mot de passe MEL (utilisé seulement pour l'appairage)" -AsSecureString
$pass = Read-PlainFromSecure $secure

try {
  $credentialText = $user + ":" + $pass
  $basicBytes = [Text.Encoding]::UTF8.GetBytes($credentialText)
  $basic = [Convert]::ToBase64String($basicBytes)
  $authHeaders = @{ Authorization = "Basic $basic" }

  Write-Host "Création d'un code d'appairage à usage unique..." -ForegroundColor Yellow
  $pairCodeReply = Invoke-RestMethod -Uri "$server/api/computer/v1/pair-code" -Method Post -Headers $authHeaders -ContentType "application/json" -Body "{}" -TimeoutSec 30
  if (-not $pairCodeReply.ok -or [string]::IsNullOrWhiteSpace([string]$pairCodeReply.code)) {
    throw "PAIR_CODE_FAILED"
  }
  $pairCode = [string]$pairCodeReply.code

  # Le mot de passe propriétaire n'est plus nécessaire après l'émission du code.
  $pass = $null
  $secure = $null
  $credentialText = $null
  $basic = $null
  $authHeaders = $null

  $computerId = "$($env:COMPUTERNAME)-$([guid]::NewGuid().ToString('N').Substring(0,8))"
  $allowedApps = @("notepad","calculator","explorer","msedge","firefox","chrome")
  $pairBody = @{
    pair_code = $pairCode
    computer_id = $computerId
    name = "PC $($env:COMPUTERNAME)"
    platform = "windows"
    version = "1.0.0"
    allowed_apps = $allowedApps
  } | ConvertTo-Json -Depth 5 -Compress

  Write-Host "Appairage avec MEL..." -ForegroundColor Yellow
  $pair = Invoke-RestMethod -Uri "$server/api/computer/v1/pair" -Method Post -ContentType "application/json" -Body $pairBody -TimeoutSec 30
  if (-not $pair.ok -or [string]::IsNullOrWhiteSpace([string]$pair.token)) {
    throw "PAIRING_FAILED"
  }

  $melDir = Join-Path $env:LOCALAPPDATA "MEL"
  New-Item -ItemType Directory -Force -Path $melDir | Out-Null

  $config = @{
    server_url = $server
    computer_id = $computerId
    token_protected = (Protect-Text ([string]$pair.token))
    allowed_apps = $allowedApps
    installed_at = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
  }
  $configPath = Join-Path $melDir "computer.json"
  $config | ConvertTo-Json -Depth 6 | Set-Content -Encoding UTF8 $configPath

  $companionPath = Join-Path $melDir "MEL-Computer-Companion.ps1"
  Write-Host "Téléchargement du compagnon..." -ForegroundColor Yellow
  $deviceHeaders = @{
    Authorization = "Bearer $([string]$pair.token)"
    "X-MEL-Computer-ID" = $computerId
  }
  Invoke-WebRequest -Uri "$server/api/computer/v1/companion" -Headers $deviceHeaders -UseBasicParsing -OutFile $companionPath -TimeoutSec 30

  $startup = [Environment]::GetFolderPath("Startup")
  $launcher = Join-Path $startup "MEL-Computer-Companion.cmd"
  $launcherLines = @(
    "@echo off",
    "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$companionPath`" -Run"
  )
  $launcherLines | Set-Content -Encoding ASCII $launcher

  Write-Host "Démarrage du compagnon..." -ForegroundColor Yellow
  Start-Process powershell.exe -WindowStyle Hidden -ArgumentList @(
    "-NoProfile",
    "-ExecutionPolicy","Bypass",
    "-File",$companionPath,
    "-Run"
  )

  Start-Sleep -Seconds 3
  Write-Host ""
  Write-Host "Installation terminée." -ForegroundColor Green
  Write-Host "Identifiant ordinateur : $computerId"
  Write-Host "Le compagnon démarrera automatiquement à chaque ouverture de session."
  Write-Host "Dans MEL > Ordinateur, utilisez Actualiser pour voir le PC en ligne."
}
finally {
  $pass = $null
  $secure = $null
}
