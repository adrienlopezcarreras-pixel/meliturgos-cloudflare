[CmdletBinding()]
param(
  [string]$ConfigPath = (Join-Path $env:LOCALAPPDATA "MEL\computer.json"),
  [string]$OutputPath = (Join-Path $env:LOCALAPPDATA "MEL\diagnostics\ollama-benchmark.json"),
  [switch]$DryRun,
  [switch]$AllowUserActivity
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version 2

# Deliberately isolated: fixed localhost endpoint, synthetic prompt only.
# No credentials, personal messages, model installs, remote GPUs or telemetry upload.
# Check owner priority on a real Windows desktop. On any Win32 error,
# do NOT interpret an unreadable last-input timestamp as an idle user.
function Get-LocalBenchmarkIdleMs {
  $typeName='MelLocalAiBenchmark.Win32InputProbe'
  if (-not ($typeName -as [type])) {
    $source=@'
using System;
using System.Runtime.InteropServices;
namespace MelLocalAiBenchmark {
  public static class Win32InputProbe {
    [StructLayout(LayoutKind.Sequential)]
    struct LastInputInfo { public uint Size; public uint Tick; }
    [DllImport("user32.dll", SetLastError=true)]
    static extern bool GetLastInputInfo(ref LastInputInfo value);
    public static long ReadIdleMs() {
      var value=new LastInputInfo();
      value.Size=(uint)Marshal.SizeOf(typeof(LastInputInfo));
      if(!GetLastInputInfo(ref value)) return -1;
      uint current=unchecked((uint)Environment.TickCount);
      return (long)unchecked(current-value.Tick);
    }
  }
}
'@
    Add-Type -TypeDefinition $source -ErrorAction Stop
  }
  return [MelLocalAiBenchmark.Win32InputProbe]::ReadIdleMs()
}

function Test-LocalBenchmarkConsent([string]$expectedProfile,[bool]$expectedGpu) {
  try {
    $fresh=Get-Content -LiteralPath $ConfigPath -Raw -Encoding UTF8 | ConvertFrom-Json
    return ($fresh.local_compute_enabled -eq $true -and
      [string]$fresh.local_compute_profile -ceq $expectedProfile -and
      ($fresh.local_compute_gpu_enabled -eq $true) -eq $expectedGpu)
  } catch { return $false }
}

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
    $settings['observed_cpu_percent']=$cpuLoad
    Write-Diagnostic 'SKIPPED_PC_BUSY' $settings
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
if (-not $AllowUserActivity) {
  try {
    $idleMs=Get-LocalBenchmarkIdleMs
    if ($idleMs -lt 60000) {
      Write-Diagnostic 'SKIPPED_USER_ACTIVE_OR_UNKNOWN' $settings
      return
    }
  } catch {
    Write-Diagnostic 'SKIPPED_USER_ACTIVE_OR_UNKNOWN' $settings
    return
  }
}
$endpoint = 'http://127.0.0.1:11434'
try {
  $available = Invoke-RestMethod -Uri ($endpoint+'/api/tags') -Method Get -TimeoutSec 4 -ErrorAction Stop
  # Disk weight is an approximate safety filter, not a hard proof of RAM/VRAM
  # use. Never load an unknown-size or oversized local model for a benchmark.
  $installed = @($available.models | Where-Object {
    $null -ne $_ -and -not [string]::IsNullOrWhiteSpace([string]$_.name) -and
    $null -ne $_.size -and [double]$_.size -gt 0
  } | Sort-Object -Property @{Expression={[double]$_.size}})
  if ($installed.Count -lt 1) {
    Write-Diagnostic 'SKIPPED_NO_SIZED_INSTALLED_MODEL' $settings
    return
  }
  $maxModelMb = if ($profile -eq 'light') {1536} elseif ($profile -eq 'balanced') {4096} else {8192}
  $limit = [int64]$maxModelMb * 1024 * 1024
  $model = [string]$env:MEL_LOCAL_AI_MODEL
  if (-not $model) {
    $candidate=@($installed | Where-Object {[double]$_.size -le $limit} | Select-Object -First 1)
    if ($candidate.Count -eq 0) {
      Write-Diagnostic 'SKIPPED_MODEL_OVER_PROFILE_BUDGET' $settings
      return
    }
    $model=[string]$candidate[0].name
  }
  $selected=@($installed | Where-Object {[string]$_.name -ceq $model} | Select-Object -First 1)
  if ($selected.Count -eq 0) {
    Write-Diagnostic 'SKIPPED_REQUESTED_MODEL_NOT_INSTALLED' $settings
    return
  }
  if ([double]$selected[0].size -gt $limit) {
    Write-Diagnostic 'SKIPPED_MODEL_OVER_PROFILE_BUDGET' $settings
    return
  }
  # Guard system RAM even when GPU offload is consented: model disk weight
  # underestimates some runtime allocations, so keep a 1 GiB OS reserve.
  try {
    $os=Get-CimInstance Win32_OperatingSystem -ErrorAction Stop
    $freeMb=[double]$os.FreePhysicalMemory / 1024.0
    $requiredMb=([double]$selected[0].size / (1024.0*1024.0)) + 1024.0
    if (([double]::IsNaN($freeMb) -or [double]::IsInfinity($freeMb)) -or $freeMb -lt $requiredMb) {
      Write-Diagnostic 'SKIPPED_INSUFFICIENT_FREE_RAM' $settings
      return
    }
  } catch {
    Write-Diagnostic 'SKIPPED_RAM_TELEMETRY_UNKNOWN' $settings
    return
  }
  # Tags discovery is separate from generation. Consent may have been
  # revoked or changed while checking the local service and model inventory.
  if (-not (Test-LocalBenchmarkConsent -expectedProfile $profile -expectedGpu $gpuAllowed)) {
    Write-Diagnostic 'SKIPPED_CONSENT_CHANGED' $settings
    return
  }
  if (-not $AllowUserActivity) {
    try {
      $idleBeforeCall=Get-LocalBenchmarkIdleMs
      if ($idleBeforeCall -lt 60000) {
        Write-Diagnostic 'SKIPPED_USER_ACTIVE_OR_UNKNOWN' $settings
        return
      }
    } catch {
      Write-Diagnostic 'SKIPPED_USER_ACTIVE_OR_UNKNOWN' $settings
      return
    }
  }
  $body = @{
    model=$model;stream=$false;keep_alive='0s'
    messages=@(@{role='user';content='Réponds uniquement OK.'})
    options=@{num_predict=12;num_ctx=1024;num_thread=$threads;num_gpu=$gpuLayers;temperature=0}
  } | ConvertTo-Json -Depth 8 -Compress
  $timer = [Diagnostics.Stopwatch]::StartNew()
  $answer = Invoke-RestMethod -Uri ($endpoint+'/api/chat') -Method Post -ContentType 'application/json' -Body $body -TimeoutSec 25 -ErrorAction Stop
  $timer.Stop()
  # A cancelled opt-in must not produce a success record if it was revoked
  # during a blocking Ollama request. This is not an execution-stop proof.
  if (-not (Test-LocalBenchmarkConsent -expectedProfile $profile -expectedGpu $gpuAllowed)) {
    Write-Diagnostic 'DISCARDED_CONSENT_REVOKED' $settings
    return
  }
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
