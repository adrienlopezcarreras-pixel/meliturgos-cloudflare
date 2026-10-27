$ErrorActionPreference='Stop'
Set-StrictMode -Version 2
# Load the real helpers only. No MEL engine startup, provider, GPU, or network.
$source=[IO.File]::ReadAllText((Join-Path $PSScriptRoot '..\..\assets\MEL-Computer-Companion.ps1'))
$tokens=$null; $parseErrors=$null
$ast=[Management.Automation.Language.Parser]::ParseInput($source,[ref]$tokens,[ref]$parseErrors)
if($parseErrors.Count){throw 'COMPANION_PARSE_FAILED'}
foreach($name in @('PcControl-LimitText','Receive-DevExecutorControl','Publish-DevExecutorView','Update-CompanionSupervision','PcControl-SystemExec')) {
  $node=$ast.Find({param($n) $n -is [Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -eq $name},$true)
  if($null -eq $node){throw ('MISSING_REAL_HELPER:'+ $name)}
  Invoke-Expression $node.Extent.Text
}
$MelDir=Join-Path $env:TEMP ('mel-liveness-'+[guid]::NewGuid().ToString('N'))
[void][IO.Directory]::CreateDirectory($MelDir)
$Headless=$true
$script:DevExecutorLastRequest=$null
$script:SupervisionHeartbeatAt=Get-Date '2000-01-01'
$script:HeartbeatTimes=@()
$script:OwnerControls=@()
$script:EnsureCalls=0
function Get-DevExecutorDisplay { return @{state='fixture-stopped';running=$false;error=''} }
function Ensure-DevExecutor { $script:EnsureCalls++ }
function Invoke-DevExecutorControl($Action,$Repo) { $script:OwnerControls+=@{action=$Action;at=[DateTime]::UtcNow} }
function Send-Heartbeat {
  # Receipt transport is deliberately stubbed; this test proves cadence, not
  # a production connection. It must not contact MEL or spend any neurons.
  $view=Get-Content -LiteralPath (Join-Path $MelDir 'dev-executor-view.json') -Raw -Encoding UTF8 | ConvertFrom-Json
  $age=[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()-[long]$view.observed_at
  if($age -gt 2500 -or $view.state -ne 'fixture-stopped' -or $view.running -ne $false){throw 'STALE_OR_FABRICATED_EXECUTOR_VIEW'}
  $script:HeartbeatTimes += [DateTime]::UtcNow
}
try {
  Update-CompanionSupervision
  $request=@{action='Stop';repo='';request_id=('a'*32);issued_at=[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds();engine_pid=$PID}|ConvertTo-Json -Compress
  $escapedPath=(Join-Path $MelDir 'dev-executor-request.json').Replace("'","''")
  $escapedRequest=$request.Replace("'","''")
  $command="[Console]::Out.Write(('X'*12000));[Console]::Error.Write(('E'*8000));Start-Sleep -Seconds 12;[IO.File]::WriteAllText('$escapedPath','$escapedRequest');Start-Sleep -Seconds 36"
  $started=[DateTime]::UtcNow
  $result=PcControl-SystemExec @{command=$command;timeout_ms=90000;require_success_exit=$true}
  $ended=[DateTime]::UtcNow
  if($result.exit_code -ne 0 -or $result.stdout.Length -ne 12000 -or -not $result.stderr.Contains(('E'*8000))){throw ('CHILD_PIPE_DRAIN_FAILED exit=' + $result.exit_code + ' stdout_chars=' + $result.stdout.Length + ' stderr_chars=' + $result.stderr.Length + ' stdout_head=' + $result.stdout.Substring(0,[Math]::Min(100,$result.stdout.Length)) + ' stderr_head=' + $result.stderr.Substring(0,[Math]::Min(100,$result.stderr.Length)))}
  if($script:HeartbeatTimes.Count -lt 4){throw 'HEARTBEAT_STARVED_BY_LONG_COMMAND'}
  for($i=1;$i -lt $script:HeartbeatTimes.Count;$i++) {
    if(($script:HeartbeatTimes[$i]-$script:HeartbeatTimes[$i-1]).TotalSeconds -gt 20){throw 'HEARTBEAT_INTERVAL_TOO_LONG'}
  }
  if($script:OwnerControls.Count -ne 1 -or $script:OwnerControls[0].action -ne 'Stop' -or $script:OwnerControls[0].at -ge $ended){throw 'OWNER_CONTROL_BLOCKED_BY_CHILD'}
  if($script:EnsureCalls -ne 1){throw 'AUTOMATIC_EXECUTOR_STARTED_DURING_CHILD'}
  $view=Get-Content -LiteralPath (Join-Path $MelDir 'dev-executor-view.json') -Raw -Encoding UTF8|ConvertFrom-Json
  if([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()-[long]$view.observed_at -gt 2500){throw 'VIEW_EXPIRED_AFTER_CHILD'}
  Write-Host 'PASS: 48-second real child retains liveness and owner controls, with truthful stopped executor state.'

  $pidPath=(Join-Path $MelDir 'child.pid').Replace("'","''")
  $timedOut=$false
  try {PcControl-SystemExec @{command="[IO.File]::WriteAllText('$pidPath',[string]`$PID);Start-Sleep -Seconds 8";timeout_ms=1000}|Out-Null}
  catch {if($_.Exception.Message -ne 'SYSTEM_EXEC_TIMEOUT'){throw};$timedOut=$true}
  if(-not $timedOut){throw 'CHILD_TIMEOUT_DISABLED'}
  if(Test-Path -LiteralPath $pidPath) {
    $childPid=[int](Get-Content -LiteralPath $pidPath -Raw)
    if(Get-Process -Id $childPid -ErrorAction SilentlyContinue){throw 'TIMED_OUT_CHILD_STILL_RUNNING'}
  }
  Write-Host 'PASS: timeout still fails and terminates the child; no result is fabricated.'
} finally {
  if(Test-Path -LiteralPath $MelDir){Remove-Item -LiteralPath $MelDir -Recurse -Force}
}
