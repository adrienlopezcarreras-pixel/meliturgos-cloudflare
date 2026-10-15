[CmdletBinding()]
param(
  [string]$ConfigPath = (Join-Path $env:LOCALAPPDATA "MEL\computer.json"),
  [string]$OutputPath = (Join-Path $env:LOCALAPPDATA "MEL\diagnostics\ollama-benchmark.json"),
  [switch]$DryRun
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version 2

# Deliberately isolated: fixed localhost endpoint, synthetic prompt only.
# No credentials, personal messages, model installs, remote GPUs or telemetry upload.
function Write-Diagnostic($status, $fields) {
  $record = [ordered]@{
    schema = 'mel.local-ai-benchmark/v1'
    status = [string]$status
    executed = ($status -eq 'MEASURED')
    observed_at = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
    prompt_or_reply_recorded = $false
    network_scope = '127.0.0.1-only'
  }
  foreach ($key in $fields.Keys) { $record[$key] = $fields[$key] }
  $text = ConvertTo-Json -InputObject $record -Depth 7
  $parent = Split-Path -Parent $OutputPath
  if (-not [string]::IsNullOrWhiteSpace($parent)) {
    [void][IO.Directory]::CreateDirectory($parent)
  }
  [IO.File]::WriteAllText($OutputPath,$text,[Text.UTF8Encoding]::new($false))
  Write-Output $text
}

if (-not (Test-Path -LiteralPath $ConfigPath -PathType Leaf)) {
  Write-Diagnostic 'SKIPPED_NO_LOCAL_CONFIG' @{}
  return
}
try {
  $config = Get-Content -Raw -Encoding UTF8 -LiteralPath $ConfigPath | ConvertFrom-Json
} catch {
  Write-Diagnostic 'SKIPPED_CONFIG_INVALID' @{}
  return
}
$profile = [string]$config.local_compute_profile
if ($config.local_compute_enabled -ne $true -or
    @('light','balanced','performance') -notcontains $profile) {
  Write-Diagnostic 'SKIPPED_NOT_OPTED_IN' @{}
  return
}
$gpuAllowed = $config.local_compute_gpu_enabled -eq $true
$gpuLayers = if (-not $gpuAllowed) {0} elseif ($profile -eq 'light') {1} elseif ($profile -eq 'balanced') {2} else {4}
$logicalCores = [Math]::Max(1,[Environment]::ProcessorCount)
$cpuTarget = if ($profile -eq 'light') {0.15} elseif ($profile -eq 'balanced') {0.35} else {0.60}
$threads = [Math]::Max(1,[Math]::Min(8,[int][Math]::Ceiling($logicalCores*$cpuTarget)))
$settings = @{profile=$profile;gpu_consent=$gpuAllowed;requested_gpu_layers=$gpuLayers;requested_cpu_threads=$threads}
if ($DryRun) {
  Write-Diagnostic 'DRY_RUN_NO_INFERENCE' $settings
  return
}
# Fail closed for an already busy Windows computer. Never turn an unknown
# CPU load reading into an idle-machine claim.
try {
  $load = @(Get-CimInstance Win32_Processor -ErrorAction Stop | Select-Object -ExpandProperty LoadPercentage)
  $cpuLoad = if ($load.Count -gt 0) { [double](($load | Measure-Object -Average).Average) } else { 100.0 }
  if ($cpuLoad -ge 70) {
    Write-Diagnostic 'SKIPPED_PC_BUSY' ($settings+@{observed_cpu_percent=$cpuLoad})
    return
  }
} catch {
  Write-Diagnostic 'SKIPPED_CPU_TELEMETRY_UNKNOWN' $settings
  return
}
try {
  Add-Type -AssemblyName System.Windows.Forms -ErrorAction Stop
  if ([System.Windows.Forms.SystemInformation]::PowerStatus.PowerLineStatus -ne
      [System.Windows.Forms.PowerLineStatus]::Online) {
    Write-Diagnostic 'SKIPPED_POWER_NOT_AC' $settings
    return
  }
} catch {
  Write-Diagnostic 'SKIPPED_POWER_UNKNOWN' $settings
  return
}
$endpoint = 'http://127.0.0.1:11434'
try {
  $available = Invoke-RestMethod -Uri ($endpoint+'/api/tags') -Method Get -TimeoutSec 4 -ErrorAction Stop
  $installed = @($available.models)
  $model = [string]$env:MEL_LOCAL_AI_MODEL
  if (-not $model) {
    if ($installed.Count -lt 1) {
      Write-Diagnostic 'SKIPPED_NO_INSTALLED_MODEL' $settings
      return
    }
    $model = [string]$installed[0].name
  }
  if (-not (@($installed | Where-Object { [string]$_.name -eq $model }).Count -gt 0)) {
    Write-Diagnostic 'SKIPPED_REQUESTED_MODEL_NOT_INSTALLED' $settings
    return
  }
  $body = @{
    model=$model;stream=$false;keep_alive='0s'
    messages=@(@{role='user';content='Réponds uniquement OK.'})
    options=@{num_predict=12;num_ctx=1024;num_thread=$threads;num_gpu=$gpuLayers;temperature=0}
  } | ConvertTo-Json -Depth 8 -Compress
  $timer = [Diagnostics.Stopwatch]::StartNew()
  $answer = Invoke-RestMethod -Uri ($endpoint+'/api/chat') -Method Post -ContentType 'application/json' -Body $body -TimeoutSec 25 -ErrorAction Stop
  $timer.Stop()
  if ([string]::IsNullOrWhiteSpace([string]$answer.message.content)) {
    Write-Diagnostic 'INVALID_EMPTY_OLLAMA_RESPONSE' $settings
    return
  }
  $tokens = [Math]::Max(0,[long]$answer.eval_count)
  $duration = [Math]::Max(0,[long]$answer.eval_duration)
  $tps = if ($duration -gt 0) {[Math]::Round($tokens*1000000000.0/$duration,2)} else {0.0}
  $settings['model']=$model
  $settings['round_trip_latency_ms']=$timer.ElapsedMilliseconds
  $settings['output_tokens']=$tokens
  $settings['tokens_per_second']=$tps
  $settings['gpu_acceleration_proven']=$false
  Write-Diagnostic 'MEASURED' $settings
} catch {
  # No error payload, HTTP content, prompt, token, or password is persisted.
  Write-Diagnostic 'OLLAMA_UNAVAILABLE_OR_TIMEOUT' $settings
}
