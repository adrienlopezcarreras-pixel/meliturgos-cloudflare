# Recree les branches supprimees a partir d'un fichier MEL-branches-sauvegarde-*.json.
param([Parameter(Mandatory=$true)][string]$Sauvegarde)
$Repo='adrienlopezcarreras-pixel/meliturgos-cloudflare'
foreach($b in (Get-Content $Sauvegarde -Raw | ConvertFrom-Json)){
  & gh api --method POST "repos/$Repo/git/refs" -f "ref=refs/heads/$($b.name)" -f "sha=$($b.sha)" 1>$null 2>$null
  if($LASTEXITCODE -eq 0){Write-Host "RESTAUREE : $($b.name)"}else{Write-Host "ECHEC ou deja presente : $($b.name)"}
}
