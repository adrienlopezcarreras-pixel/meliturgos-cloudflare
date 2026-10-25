# Owner-attended native Companion upgrade. The native executable embeds and supervises
# the PowerShell engine; updating only the .ps1 is not a complete upgrade.
$ErrorActionPreference = 'Stop'
$melDir = Join-Path $env:LOCALAPPDATA 'MEL'
$configPath = Join-Path $melDir 'computer.json'
$installedExe = Join-Path $melDir 'MEL-Companion.exe'
$installedEngine = Join-Path $melDir 'MEL-Computer-Companion.ps1'
$packageExe = Join-Path $PSScriptRoot 'MEL-Companion.exe'
$packageEngine = Join-Path $PSScriptRoot 'MEL-Computer-Companion.ps1'
if (!(Test-Path -LiteralPath $configPath -PathType Leaf)) { throw 'COMPANION_NOT_PAIRED' }
foreach ($path in @($installedExe,$packageExe,$packageEngine)) {
  if (!(Test-Path -LiteralPath $path -PathType Leaf)) { throw "COMPANION_NATIVE_UPDATE_FILE_MISSING:$path" }
}
$config = Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json
if ([string]::IsNullOrWhiteSpace([string]$config.computer_id) -or [string]::IsNullOrWhiteSpace([string]$config.token_protected)) {
  throw 'COMPANION_EXISTING_IDENTITY_INVALID'
}
$tokens = $null; $errors = $null
[void][System.Management.Automation.Language.Parser]::ParseFile($packageEngine,[ref]$tokens,[ref]$errors)
if ($errors.Count) { throw 'COMPANION_PACKAGE_POWERSHELL_INVALID' }
$previousHash = (Get-FileHash -LiteralPath $installedExe -Algorithm SHA256).Hash
$newHash = (Get-FileHash -LiteralPath $packageExe -Algorithm SHA256).Hash
$expectedEngineHash = (Get-FileHash -LiteralPath $packageEngine -Algorithm SHA256).Hash
$engineCurrent = (Test-Path -LiteralPath $installedEngine -PathType Leaf) -and
  ((Get-FileHash -LiteralPath $installedEngine -Algorithm SHA256).Hash -eq $expectedEngineHash)
# Owner maintenance scripts ship beside the executable; an unchanged EXE must
# not leave stale or broken copies installed.
$scriptsUpdated = 0
foreach ($name in @('MEL-Grand-Nettoyage.ps1','MEL-Nettoyage-GitHub.ps1','MEL-Restaurer-Branches.ps1','MEL-Sauvegarde-Locale-D1.ps1')) {
  $from = Join-Path $PSScriptRoot $name
  $to = Join-Path $melDir $name
  if (!(Test-Path -LiteralPath $from -PathType Leaf)) { continue }
  $parseErrors = $null
  [void][System.Management.Automation.Language.Parser]::ParseFile($from,[ref]$null,[ref]$parseErrors)
  if ($parseErrors.Count) { throw "COMPANION_PACKAGE_SCRIPT_INVALID:$name" }
  if (!(Test-Path -LiteralPath $to -PathType Leaf) -or
      (Get-FileHash -LiteralPath $to -Algorithm SHA256).Hash -ne (Get-FileHash -LiteralPath $from -Algorithm SHA256).Hash) {
    Copy-Item -LiteralPath $from -Destination $to -Force
    $scriptsUpdated++
  }
}
if ($scriptsUpdated) { Write-Host "Scripts de maintenance mis a jour : $scriptsUpdated." }
if ($previousHash -eq $newHash -and $engineCurrent) {
  Write-Host 'Application native et moteur deja a jour. Appairage conserve.'
  return
}
Write-Host "PC existant : $($config.computer_id)"
Write-Host 'Cette operation redemarre MEL Companion en preservant computer.json.'
$approval = Read-Host 'Confirmer la mise a jour native ? Tapez METTRE_A_JOUR'
if ($approval -cne 'METTRE_A_JOUR') { throw 'COMPANION_UPDATE_NOT_APPROVED' }
$backupExe = Join-Path $melDir 'MEL-Companion.exe.previous'
$backupEngine = Join-Path $melDir 'MEL-Computer-Companion.ps1.previous'
Copy-Item -LiteralPath $installedExe -Destination $backupExe -Force
if (Test-Path -LiteralPath $installedEngine) {
  Copy-Item -LiteralPath $installedEngine -Destination $backupEngine -Force
}
# Stop only the local installed Companion and its supervised PowerShell engine.
# Never stop arbitrary user PowerShell or other desktop applications.
$exePath = [IO.Path]::GetFullPath($installedExe)
$native = @(Get-CimInstance Win32_Process -Filter "Name = 'MEL-Companion.exe'" |
  Where-Object { $_.ExecutablePath -and [string]::Equals([string]$_.ExecutablePath,$exePath,[StringComparison]::OrdinalIgnoreCase) })
foreach ($process in $native) { Stop-Process -Id $process.ProcessId -Force -ErrorAction Stop }
$escapedEngine = [regex]::Escape($installedEngine)
$engines = @(Get-CimInstance Win32_Process -Filter "Name = 'powershell.exe'" |
  Where-Object { $_.ProcessId -ne $PID -and [string]$_.CommandLine -match $escapedEngine -and [string]$_.CommandLine -match '(?i)(?:^|\s)-Run(?:\s|$)' })
foreach ($process in $engines) { Stop-Process -Id $process.ProcessId -Force -ErrorAction Stop }
$started = $null
try {
  # The native executable already implements InstallFiles(): it installs itself,
  # installs its embedded PowerShell engine, and starts the supervised process.
  $started = Start-Process -FilePath $packageExe -PassThru
  Start-Sleep -Seconds 4
  $started.Refresh()
  if ($started.HasExited) { throw "COMPANION_NATIVE_UPGRADE_EXITED:$($started.ExitCode)" }
  if (!(Test-Path -LiteralPath $installedExe -PathType Leaf) -or
      (Get-FileHash -LiteralPath $installedExe -Algorithm SHA256).Hash -ne $newHash) {
    throw 'COMPANION_NATIVE_INSTALL_HASH_MISMATCH'
  }
  # F5/F6 require that the installed engine matches the native binary's embedded
  # engine. An EXE-only hash is not proof that the actual command runner upgraded.
  $expectedEngineHash = (Get-FileHash -LiteralPath $packageEngine -Algorithm SHA256).Hash
  if (!(Test-Path -LiteralPath $installedEngine -PathType Leaf) -or
      (Get-FileHash -LiteralPath $installedEngine -Algorithm SHA256).Hash -ne $expectedEngineHash) {
    throw 'COMPANION_EMBEDDED_ENGINE_INSTALL_HASH_MISMATCH'
  }
  Write-Host 'Companion natif mis a jour et demarre. Controlez son etat dans MEL.'
} catch {
  # The new packaged process may still hold the installed EXE open. Stop it
  # before restoring, and retain the original failure even if rollback fails.
  $upgradeError = $_
  try {
    if ($null -ne $started -and -not $started.HasExited) {
      Stop-Process -Id $started.Id -Force -ErrorAction Stop
      $started.WaitForExit(5000) | Out-Null
    }
    $newInstalled = @(Get-CimInstance Win32_Process -Filter "Name = 'MEL-Companion.exe'" |
      Where-Object { $_.ExecutablePath -and [string]::Equals([string]$_.ExecutablePath,$exePath,[StringComparison]::OrdinalIgnoreCase) })
    foreach ($process in $newInstalled) { Stop-Process -Id $process.ProcessId -Force -ErrorAction Stop }
  } catch { Write-Warning "COMPANION_ROLLBACK_PROCESS_STOP_FAILED:$($_.Exception.Message)" }
  # Restore installed native binary and script before restarting the previous UI.
  Copy-Item -LiteralPath $backupExe -Destination $installedExe -Force
  if (Test-Path -LiteralPath $backupEngine -PathType Leaf) {
    Copy-Item -LiteralPath $backupEngine -Destination $installedEngine -Force
  }
  Start-Process -FilePath $installedExe | Out-Null
  throw $upgradeError
}
