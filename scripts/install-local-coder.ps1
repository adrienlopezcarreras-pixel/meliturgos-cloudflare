# Best coder that loads on the RX 9060 (8 GB). A 14B or 30B coder does not fit.
$ErrorActionPreference = 'Stop'
$model = 'qwen2.5-coder:7b'
ollama pull $model
$dir = Join-Path $env:LOCALAPPDATA 'MEL'
New-Item -ItemType Directory -Force -Path $dir | Out-Null
Set-Content -LiteralPath (Join-Path $dir 'local-coder.txt') -Value $model -Encoding ascii
Write-Output "CODER_READY $model"
