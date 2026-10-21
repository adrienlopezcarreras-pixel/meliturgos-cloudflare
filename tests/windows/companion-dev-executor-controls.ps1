# [Codex] Real Windows processes/config/WinForms; disposable repository and
# local fixture only. Does not contact MEL, claim jobs or use owner secrets.
param([string]$NativeAssembly)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
function Assert($condition, $message) { if (-not $condition) { throw $message } }
$source = [IO.File]::ReadAllText((Join-Path $PSScriptRoot '../../assets/MEL-Computer-Companion.ps1'))
$tokens = $null; $errors = $null
$ast = [Management.Automation.Language.Parser]::ParseInput($source, [ref]$tokens, [ref]$errors)
Assert ($errors.Count -eq 0) 'PARSE_FAILED'
$root = Join-Path ([IO.Path]::GetTempPath()) ('mel executor ' + [Guid]::NewGuid().ToString('N'))
[void][IO.Directory]::CreateDirectory($root)
$MelDir = $root; $ConfigPath = Join-Path $root 'computer.json'; $Server = 'https://example.invalid'
$repo = Join-Path $root 'repository with spaces'
[void][IO.Directory]::CreateDirectory((Join-Path $repo 'scripts'))
[void][IO.Directory]::CreateDirectory((Join-Path $repo '.git'))
$fixture = @'
const fs=require('fs'),path=require('path');
const dir=process.env.MEL_DEV_BRIDGE_CONTROL_DIR;
const timer=setInterval(()=>{
 if(!dir)return;
 if(fs.existsSync(path.join(dir,'stop')))process.exit(0);
 fs.writeFileSync(path.join(dir,'status.json'),JSON.stringify({pid:process.pid,repo:process.cwd(),session:process.env.MEL_DEV_BRIDGE_SESSION,heartbeat_at:Date.now(),code:'RUNNING'}));
},100);
'@
[IO.File]::WriteAllText((Join-Path $repo 'scripts/mel-dev-bridge.mjs'), $fixture.Replace("const fs=require('fs'),path=require('path');", "import fs from 'node:fs'; import path from 'node:path';"))
[IO.File]::WriteAllText($ConfigPath, (@{ dev_executor_enabled=$false; dev_executor_repo=$repo; token_protected='opaque-test-value'; unrelated=@{ nested=42 } } | ConvertTo-Json -Depth 5))
$start = $source.IndexOf('$script:DevExecutorProcess = $null')
$end = $source.IndexOf('function Send-Heartbeat', $start)
Invoke-Expression $source.Substring($start, $end-$start)
foreach ($name in @('Show-MelTrayPanel','Update-DevExecutorPanel')) {
  $panel = $ast.FindAll({ param($n) $n -is [Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -eq $name }, $false)[0]
  Invoke-Expression $panel.Extent.Text
}
$external = $null
$native = $null
if ($NativeAssembly) {
  $assembly = [Reflection.Assembly]::LoadFile($NativeAssembly)
  $native = $assembly.GetType('MelApp')
  $native.GetField('MelDir').SetValue($null, $root)
  $native.GetField('ConfigPath').SetValue($null, $ConfigPath)
  $native.GetField('CompanionProcess').SetValue($null, [Diagnostics.Process]::GetCurrentProcess())
  Assert ($native.GetMethod('ValidDevExecutorRepo').Invoke($null,[string[]]@($repo))) 'NATIVE_REPO_VALIDATION_FAILED'
}
try {
  Ensure-DevExecutor
  Assert ($null -eq $script:DevExecutorProcess) 'FIRST_LAUNCH_MUST_NOT_ENABLE'
  Show-MelTrayPanel
  Assert $script:MelPanel.Visible 'PANEL_NOT_MODELESS'
  $buttons = @($script:MelPanel.Controls | Where-Object { $_ -is [Windows.Forms.Button] })
  ($buttons | Where-Object Text -eq "Démarrer l'exécuteur").PerformClick()
  Assert ($null -ne $script:DevExecutorProcess) 'START_BUTTON_NO_PROCESS'
  $firstPid = $script:DevExecutorProcess.Id
  $deadline = (Get-Date).AddSeconds(8)
  do { Start-Sleep -Milliseconds 150; $view = Get-DevExecutorDisplay } while ($view.state -ne 'En ligne' -and (Get-Date) -lt $deadline)
  Assert ($view.state -eq 'En ligne') 'CLOUD_RECEIPT_NOT_DISPLAYED'
  Assert ((Get-Content -Raw $ConfigPath | ConvertFrom-Json).dev_executor_enabled -eq $true) 'ACTIVATION_NOT_PERSISTED'
  Ensure-DevExecutor; Ensure-DevExecutor
  Assert ($script:DevExecutorProcess.Id -eq $firstPid) 'DUPLICATE_PROCESS'
  Assert (@(Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -like ('*' + $repo + '*') }).Count -eq 1) 'MULTIPLE_NODE_PROCESSES'
  $script:DevExecutorProcess.Kill(); $script:DevExecutorProcess.WaitForExit()
  Ensure-DevExecutor
  Assert ($script:DevExecutorCode -eq 'NODE_EXITED') 'CRASH_NOT_DETECTED'
  Assert ($null -eq $script:DevExecutorProcess) 'CRASH_RESTART_LOOP'
  ($buttons | Where-Object Text -eq "Redémarrer l'exécuteur").PerformClick()
  Assert ($script:DevExecutorProcess -and $script:DevExecutorProcess.Id -ne $firstPid) 'RESTART_BUTTON_NO_NEW_PROCESS'
  $stale = @{ pid=$script:DevExecutorProcess.Id; session=$script:DevExecutorSession; repo=$repo; heartbeat_at=([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()-120000); code='RUNNING' }
  # Avoid racing fixture writes when checking expiry: temporarily read the same
  # genuine process/session from a separate local receipt directory.
  $oldControl = $script:DevExecutorControl
  $staleDir = Join-Path $root 'stale'; [void][IO.Directory]::CreateDirectory($staleDir)
  $script:DevExecutorControl = $staleDir
  [IO.File]::WriteAllText((Join-Path $staleDir 'status.json'), ($stale | ConvertTo-Json))
  Assert ((Get-DevExecutorDisplay).state -eq 'Erreur') 'STALE_HEARTBEAT_LOOKS_ONLINE'
  $script:DevExecutorControl = $oldControl
  # Normal Companion exit stops its child but preserves the owner's activation.
  Stop-DevExecutor
  $script:DevExecutorFaulted = $false
  Ensure-DevExecutor
  Assert ($null -ne $script:DevExecutorProcess) 'COMPANION_RESTART_DID_NOT_RESUME'
  ($buttons | Where-Object Text -eq "Arrêter l'exécuteur").PerformClick()
  Ensure-DevExecutor
  Assert ($null -eq $script:DevExecutorProcess) 'VOLUNTARY_STOP_RESTARTED'
  $saved = Get-Content -Raw $ConfigPath | ConvertFrom-Json
  Assert ($saved.dev_executor_enabled -eq $false) 'DISABLE_NOT_PERSISTED'
  Assert ($saved.token_protected -eq 'opaque-test-value' -and $saved.unrelated.nested -eq 42) 'CONFIG_FIELDS_LOST'
  $request = @{ action='Start'; repo=$repo; request_id=[Guid]::NewGuid().ToString('N'); engine_pid=$PID; issued_at=[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds() }
  if ($native) {
    $native.GetMethod('RequestDevExecutor').Invoke($null,[string[]]@('Start',$repo))
    $request = Get-Content -Raw (Join-Path $MelDir 'dev-executor-request.json') | ConvertFrom-Json
  } else { [IO.File]::WriteAllText((Join-Path $MelDir 'dev-executor-request.json'), ($request | ConvertTo-Json)) }
  Receive-DevExecutorControl
  Assert ($null -ne $script:DevExecutorProcess) 'NATIVE_WINDOW_REQUEST_DID_NOT_START'
  $nativePid = $script:DevExecutorProcess.Id
  $request.action = 'Restart'
  [IO.File]::WriteAllText((Join-Path $MelDir 'dev-executor-request.json'), ($request | ConvertTo-Json))
  Receive-DevExecutorControl
  Assert ($script:DevExecutorProcess.Id -eq $nativePid) 'DUPLICATE_REQUEST_EXECUTED_AGAIN'
  $request.request_id = [Guid]::NewGuid().ToString('N'); $request.action = 'Stop'
  [IO.File]::WriteAllText((Join-Path $MelDir 'dev-executor-request.json'), ($request | ConvertTo-Json))
  Receive-DevExecutorControl
  Assert ($null -eq $script:DevExecutorProcess) 'NATIVE_WINDOW_REQUEST_DID_NOT_STOP'
  $request.request_id = [Guid]::NewGuid().ToString('N'); $request.action = 'Start'; $request.engine_pid = 1
  [IO.File]::WriteAllText((Join-Path $MelDir 'dev-executor-request.json'), ($request | ConvertTo-Json))
  Receive-DevExecutorControl
  Assert ($null -eq $script:DevExecutorProcess) 'STALE_ENGINE_REQUEST_EXECUTED'
  $script:DevExecutorCode = 'DISABLED'
  Publish-DevExecutorView
  $nativeView = Get-Content -Raw (Join-Path $MelDir 'dev-executor-view.json') | ConvertFrom-Json
  Assert ($nativeView.engine_pid -eq $PID -and $nativeView.state -eq 'Arrêté') 'NATIVE_WINDOW_VIEW_INVALID'
  if ($native) {
    $readView = $native.GetMethod('ReadDevExecutorView').Invoke($null,@())
    Assert ($readView['state'] -eq 'Arrêté') 'NATIVE_WINDOW_DID_NOT_READ_ENGINE_RECEIPT'
  }
  $script:CompanionConfirmedAt = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
  $script:GithubRelay = @{ status='ONLINE' }
  $view = Get-DevExecutorDisplay
  Assert ($view.state -eq 'Arrêté' -and $view.relay -eq 'Disponible') 'CLOUD_RELAY_CONFLATED_WITH_PC'
  $script:CompanionConfirmedAt -= 60000
  Assert ((Get-DevExecutorDisplay).relay -eq 'Inconnu') 'STALE_CLOUD_PRESENCE_LOOKS_CONFIRMED'
  Set-DevExecutorConfiguration $true
  $script:DevExecutorRepo = ''
  $saved.dev_executor_repo = ''; $saved.dev_executor_enabled = $true
  [IO.File]::WriteAllText($ConfigPath, ($saved | ConvertTo-Json -Depth 5))
  Ensure-DevExecutor
  Assert ($script:DevExecutorCode -eq 'REPO_MISSING') 'MISSING_REPO_NOT_REPORTED'
  $forbidden = Join-Path $repo '.mel-dev-candidates'
  [void][IO.Directory]::CreateDirectory($forbidden)
  $refused = $false; try { Resolve-DevExecutorRepo $forbidden } catch { $refused = $true }
  Assert $refused 'CANDIDATE_DIRECTORY_ACCEPTED_AS_MAIN'
  Set-DevExecutorConfiguration $true $repo
  $external = Start-Process -FilePath (Get-Command node).Source -ArgumentList @(('"' + (Join-Path $repo 'scripts/mel-dev-bridge.mjs') + '"')) -WorkingDirectory $repo -PassThru -WindowStyle Hidden
  Start-Sleep -Milliseconds 400
  Ensure-DevExecutor
  Assert ($script:DevExecutorCode -eq 'EXTERNAL_EXECUTOR_ACTIVE' -and $null -eq $script:DevExecutorProcess) 'EXISTING_EXTERNAL_PROCESS_DUPLICATED'
  Write-Host 'PASS: first launch, real UI start/stop/restart, persistence, no duplicates, Node crash, Companion restart, missing repo, stale heartbeat, independent GitHub relay.'
} finally {
  if ($script:MelPanel) { $script:MelPanel.Close(); $script:MelPanel.Dispose() }
  Stop-DevExecutor
  if ($external -and -not $external.HasExited) { $external.Kill(); $external.WaitForExit(); $external.Dispose() }
  Remove-Item -LiteralPath $root -Recurse -Force
}
