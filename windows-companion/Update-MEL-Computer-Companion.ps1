# Mise à jour locale explicite : conserve l'identité PC et les autorisations.
# Exécuter depuis le ZIP Windows validé, dans la session interactive propriétaire.
$ErrorActionPreference = 'Stop'
$melDir = Join-Path $env:LOCALAPPDATA 'MEL'
$configPath = Join-Path $melDir 'computer.json'
$enginePath = Join-Path $melDir 'MEL-Computer-Companion.ps1'
$packageEngine = Join-Path $PSScriptRoot 'MEL-Computer-Companion.ps1'
if (!(Test-Path -LiteralPath $configPath -PathType Leaf)) { throw 'COMPANION_NOT_PAIRED' }
if (!(Test-Path -LiteralPath $enginePath -PathType Leaf)) { throw 'COMPANION_ENGINE_NOT_INSTALLED' }
if (!(Test-Path -LiteralPath $packageEngine -PathType Leaf)) { throw 'COMPANION_PACKAGE_ENGINE_MISSING' }
$config = Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json
if ([string]::IsNullOrWhiteSpace([string]$config.computer_id) -or [string]::IsNullOrWhiteSpace([string]$config.token_protected)) {
  throw 'COMPANION_EXISTING_IDENTITY_INVALID'
}
$tokens = $null; $parseErrors = $null
[void][System.Management.Automation.Language.Parser]::ParseFile($packageEngine,[ref]$tokens,[ref]$parseErrors)
if ($parseErrors.Count) { throw 'COMPANION_PACKAGE_POWERSHELL_INVALID' }
$oldHash = (Get-FileHash -LiteralPath $enginePath -Algorithm SHA256).Hash
$newHash = (Get-FileHash -LiteralPath $packageEngine -Algorithm SHA256).Hash
if ($oldHash -eq $newHash) {
  Write-Host 'Companion déjà à jour. Identité et autorisations conservées.'
  return
}
Write-Host "PC existant : $($config.computer_id)"
Write-Host "SHA256 actuel : $oldHash"
Write-Host "SHA256 nouveau : $newHash"
$approval = Read-Host 'Confirmer la mise à jour locale du Companion ? Tapez METTRE_A_JOUR'
if ($approval -cne 'METTRE_A_JOUR') { throw 'COMPANION_UPDATE_NOT_APPROVED' }
$backup = Join-Path $melDir 'MEL-Computer-Companion.ps1.previous'
$staged = Join-Path $melDir 'MEL-Computer-Companion.ps1.new'
Copy-Item -LiteralPath $packageEngine -Destination $staged -Force
if ((Get-FileHash -LiteralPath $staged -Algorithm SHA256).Hash -ne $newHash) { throw 'COMPANION_STAGING_HASH_MISMATCH' }
Copy-Item -LiteralPath $enginePath -Destination $backup -Force
# Stop only the existing engine running with this exact installed path.
$escapedPath = [regex]::Escape($enginePath)
$engines = @(Get-CimInstance Win32_Process -Filter "Name = 'powershell.exe'" |
  Where-Object { $_.ProcessId -ne $PID -and [string]$_.CommandLine -match $escapedPath -and [string]$_.CommandLine -match '(?i)(?:^|\\s)-Run(?:\\s|$)' })
foreach ($engine in $engines) { Stop-Process -Id $engine.ProcessId -Force -ErrorAction Stop }
try {
  Copy-Item -LiteralPath $staged -Destination $enginePath -Force
  if ((Get-FileHash -LiteralPath $enginePath -Algorithm SHA256).Hash -ne $newHash) { throw 'COMPANION_INSTALL_HASH_MISMATCH' }
  $args = '-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + $enginePath + '" -Run'
  $started = Start-Process powershell.exe -ArgumentList $args -WindowStyle Hidden -PassThru
  Start-Sleep -Seconds 2
  $started.Refresh()
  if ($started.HasExited) { throw "COMPANION_UPDATED_ENGINE_EXITED:$($started.ExitCode)" }
  Write-Host 'Mise à jour locale démarrée. Vérifier le Companion dans MEL > Ordinateur.'
} catch {
  Copy-Item -LiteralPath $backup -Destination $enginePath -Force
  $args = '-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + $enginePath + '" -Run'
  Start-Process powershell.exe -ArgumentList $args -WindowStyle Hidden | Out-Null
  throw
} finally {
  Remove-Item -LiteralPath $staged -Force -ErrorAction SilentlyContinue
}
