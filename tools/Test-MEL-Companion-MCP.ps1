# MEL MCP local prerequisites checker. Read-only; never installs software or changes policy.
$ErrorActionPreference = 'Stop'
Write-Host 'MEL Companion MCP — diagnostic local (lecture seule)'
foreach ($name in @('node','git','gh')) {
  $cmd = Get-Command $name -ErrorAction SilentlyContinue
  if ($null -eq $cmd) {
    Write-Host "$name : ABSENT"
  } else {
    Write-Host "$name : PRESENT ($($cmd.Source))"
  }
}
$cfg = Join-Path $env:LOCALAPPDATA 'MEL\computer.json'
Write-Host ("Companion configuration : " + $(if (Test-Path -LiteralPath $cfg) {'PRESENT'} else {'ABSENTE'}))
$root = (Get-Location).Path
$server = Join-Path $root 'tools\mel-companion-mcp.mjs'
Write-Host ("Serveur MCP : " + $(if (Test-Path -LiteralPath $server) {'PRESENT'} else {'ABSENT (ouvrir le dépôt MEL)'}))
Write-Host 'Aucune commande distante effectuée. Aucun secret lu ni affiché.'
