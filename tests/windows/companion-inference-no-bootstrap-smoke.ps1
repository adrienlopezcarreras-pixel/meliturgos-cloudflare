$ErrorActionPreference='Stop'
Set-StrictMode -Version 2
$agent=Join-Path $PSScriptRoot '..\..\assets\MEL-Computer-Companion.ps1'
$source=[IO.File]::ReadAllText([IO.Path]::GetFullPath($agent))
$start=$source.IndexOf('function Get-SovereigntyLocalAiState {')
$end=$source.IndexOf('function Get-LocalComputeProfile',$start)
if($start -lt 0 -or $end -lt $start){throw 'LOCAL_AI_FUNCTION_NOT_FOUND'}
# Parse only this one pure orchestration function; never dot-source/start the
# Companion engine and never permit any connection to external hosts.
Invoke-Expression $source.Substring($start,$end-$start)
$script:FakeTags=$null
$script:FreeKb=8388608
$script:BootstrapCount=0
function Test-SovereigntyLocalAiEndpoint { param($ignored) return $script:FakeTags }
function Start-SovereigntyAiBootstrap {param($requestedModel) $script:BootstrapCount++;return 'STARTED'}
function Get-CimInstance {param($ClassName) if($ClassName -ne 'Win32_OperatingSystem'){throw 'FORBIDDEN_PROBE'};return [pscustomobject]@{FreePhysicalMemory=$script:FreeKb}}
function ExpectFailure([string]$expected) {
  try { [void](Get-SovereigntyLocalAiState -NoBootstrap -Profile 'light');throw 'EXPECTED_FAILURE_NOT_THROWN' }
  catch {if([string]$_.Exception.Message -ne $expected){throw "Expected $expected but got $($_.Exception.Message)"}}
}
$originalModel=$env:MEL_LOCAL_AI_MODEL
try {
  $env:MEL_LOCAL_AI_MODEL=''
  ExpectFailure 'SOVEREIGNTY_AI_LOCAL_ENGINE_UNAVAILABLE'
  if($script:BootstrapCount -ne 0){throw 'INFERENCE_AUTO_STARTED_INSTALLER'}
  $script:FakeTags=[pscustomobject]@{models=@()}
  ExpectFailure 'SOVEREIGNTY_AI_LOCAL_MODEL_MISSING'
  if($script:BootstrapCount -ne 0){throw 'INFERENCE_AUTO_PULLED_MODEL'}
  $script:FakeTags=[pscustomobject]@{models=@(
    [pscustomobject]@{name='too-big:7b';size=4294967296},
    [pscustomobject]@{name='small-local:latest';size=838860800},
    [pscustomobject]@{name='unknown-size';size=0}
  )}
  $found=Get-SovereigntyLocalAiState -NoBootstrap -Profile 'light'
  if($found.model -ne 'small-local:latest'){throw 'DID_NOT_SELECT_SMALLEST_SAFE_MODEL'}
  if($script:BootstrapCount -ne 0){throw 'UNEXPECTED_INSTALL_WITH_CACHED_MODEL'}
  $env:MEL_LOCAL_AI_MODEL='too-big:7b'
  ExpectFailure 'SOVEREIGNTY_AI_LOCAL_MODEL_OVER_BUDGET_OR_NOT_INSTALLED'
  if($script:BootstrapCount -ne 0){throw 'OVERSIZED_MODEL_TRIGGERED_PULL'}
  $env:MEL_LOCAL_AI_MODEL=''
  $script:FreeKb=512000
  ExpectFailure 'SOVEREIGNTY_AI_LOCAL_INSUFFICIENT_RAM'
  if($script:BootstrapCount -ne 0){throw 'LOW_RAM_TRIGGERED_INSTALL'}
  Write-Output 'No-bootstrap local Ollama model selection PASS (mocked, no network)'
}
finally {$env:MEL_LOCAL_AI_MODEL=$originalModel}
