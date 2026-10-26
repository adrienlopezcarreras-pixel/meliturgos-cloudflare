$ErrorActionPreference = 'Stop'
$dir = Join-Path $env:LOCALAPPDATA 'MEL'
New-Item -ItemType Directory -Force -Path $dir | Out-Null

$ollama = @(
  "$env:LOCALAPPDATA\Programs\Ollama\ollama.exe",
  "$env:LOCALAPPDATA\Ollama\ollama.exe",
  "$env:ProgramFiles\Ollama\ollama.exe"
) | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
if (-not $ollama) { throw 'Ollama absent. Relance d''abord l''installation du modele.' }

try { Invoke-RestMethod 'http://127.0.0.1:11434/api/tags' -TimeoutSec 3 | Out-Null }
catch { Start-Process -FilePath $ollama -ArgumentList 'serve' -WindowStyle Hidden; Start-Sleep -Seconds 4 }

& $ollama pull 'moondream'
[IO.File]::WriteAllText((Join-Path $dir 'local-vision.txt'), 'moondream')

winget install --id Gyan.FFmpeg -e --accept-package-agreements --accept-source-agreements

Write-Output 'Voix Windows : deja presente, rien a installer.'
Write-Output 'Vision : moondream. Video : ffmpeg.'
Write-Output 'Image : il faut un Automatic1111 qui repond sur http://127.0.0.1:7860 . Sans lui, les images restent sur Cloudflare.'
try { Invoke-WebRequest 'http://127.0.0.1:7860/sdapi/v1/sd-models' -UseBasicParsing -TimeoutSec 3 | Out-Null; Write-Output 'Moteur image : present.' }
catch { Write-Output 'Moteur image : absent.' }
