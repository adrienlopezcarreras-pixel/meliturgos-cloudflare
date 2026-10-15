$ErrorActionPreference='Stop'
$script=Join-Path $PSScriptRoot '..\..\scripts\companion-local-ai-benchmark.ps1'
$tmp=Join-Path ([IO.Path]::GetTempPath()) ('mel-local-ai-benchmark-'+[Guid]::NewGuid().ToString('N'))
[void][IO.Directory]::CreateDirectory($tmp)
try {
 $config=Join-Path $tmp 'computer.json'
 $out=Join-Path $tmp 'result.json'
 $r=& $script -ConfigPath $config -OutputPath $out -DryRun | ConvertFrom-Json
 if ($r.status -ne 'SKIPPED_NO_LOCAL_CONFIG') {throw 'Missing config must skip'}
 '{"local_compute_enabled":false,"local_compute_profile":"performance","local_compute_gpu_enabled":true}' | Set-Content -LiteralPath $config -Encoding UTF8
 $r=& $script -ConfigPath $config -OutputPath $out -DryRun | ConvertFrom-Json
 if ($r.status -ne 'SKIPPED_NOT_OPTED_IN') {throw 'Local opt-in must be required'}
 '{"local_compute_enabled":true,"local_compute_profile":"light","local_compute_gpu_enabled":false}' | Set-Content -LiteralPath $config -Encoding UTF8
 $r=& $script -ConfigPath $config -OutputPath $out -DryRun | ConvertFrom-Json
 if ($r.status -ne 'DRY_RUN_NO_INFERENCE' -or $r.requested_gpu_layers -ne 0 -or $r.executed) {throw 'CPU-only dry-run failed'}
 '{"local_compute_enabled":true,"local_compute_profile":"balanced","local_compute_gpu_enabled":true}' | Set-Content -LiteralPath $config -Encoding UTF8
 $r=& $script -ConfigPath $config -OutputPath $out -DryRun | ConvertFrom-Json
 if ($r.requested_gpu_layers -ne 2 -or $r.executed) {throw 'GPU consent and profile not applied'}
 if ($r.prompt_or_reply_recorded -ne $false -or $r.network_scope -ne '127.0.0.1-only') {throw 'Privacy contract failed'}
 $r=& $script -ConfigPath $config -OutputPath $out -DryRun -AllowUserActivity | ConvertFrom-Json
 if ($r.status -ne 'DRY_RUN_NO_INFERENCE' -or $r.executed) {throw 'Manual override must never bypass DryRun'}
 # A busy user's PC must be reported honestly, without launching Ollama.
 # The fake processor reading ends the benchmark before any network call.
 function Get-CimInstance {
   [CmdletBinding()]
   param([string]$ClassName)
   if($ClassName -eq 'Win32_Processor'){
     return [pscustomobject]@{ LoadPercentage=93 }
   }
   throw 'UNKNOWN_CLASS'
 }
 $r=& $script -ConfigPath $config -OutputPath $out -AllowUserActivity | ConvertFrom-Json
 if ($r.status -ne 'SKIPPED_PC_BUSY' -or $r.executed -or
     [double]$r.observed_cpu_percent -ne 93){
   throw ('Busy processor reported incorrectly: '+($r|ConvertTo-Json -Compress))
 }
 Remove-Item Function:\Get-CimInstance -Force
 Write-Output 'Companion offline benchmark dry-run and busy-CPU contracts PASS'
} finally {
 Remove-Item -LiteralPath $tmp -Recurse -Force -ErrorAction SilentlyContinue
}
