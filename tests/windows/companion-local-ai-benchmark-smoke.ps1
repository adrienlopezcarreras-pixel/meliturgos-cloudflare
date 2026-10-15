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
 Write-Output 'Companion offline benchmark dry-run contract PASS'
} finally {
 Remove-Item -LiteralPath $tmp -Recurse -Force -ErrorAction SilentlyContinue
}
