$ErrorActionPreference = "Stop"
Write-Host "MELITURGOS - Cloudflare / Codex setup" -ForegroundColor Cyan
Write-Host ""
$wsl = Get-Command wsl.exe -ErrorAction SilentlyContinue
if (-not $wsl) {
    Write-Host "WSL2 n'est pas installé." -ForegroundColor Yellow
    Write-Host "Cloudflare recommande WSL2 pour Codex CLI sous Windows."
    Write-Host "Commande Microsoft à exécuter dans PowerShell administrateur : wsl --install"
    exit 1
}
Write-Host "WSL détecté." -ForegroundColor Green
Write-Host "Ouvre WSL dans ce dossier puis exécute :"
Write-Host "  bash setup-cloudflare-codex.sh" -ForegroundColor White
Write-Host ""
Write-Host "Le script installera Codex, les Cloudflare Skills et les MCP Cloudflare."
