# MEL - orchestrateur de maintenance a un clic. Operation non destructive pour les donnees applicatives.
$ErrorActionPreference='Stop'
$ReportDir=Join-Path $PSScriptRoot 'RAPPORTS'
New-Item -ItemType Directory -Force -Path $ReportDir | Out-Null
$Stamp=Get-Date -Format 'yyyyMMdd-HHmmss'
$Report=Join-Path $ReportDir "MEL-NETTOYAGE-TOTAL-$Stamp.txt"
function Report([string]$Line) { $Line | Tee-Object -FilePath $Report -Append }
Report 'MEL - Grand nettoyage coordonne, developpement en pause'
Report "Debut: $(Get-Date -Format o)"
Report 'ETAPE 1 - Nettoyage GitHub: branches fusionnees non actives, anciens caches, runs annules et artefacts temporaires (regles de conservation).'
try {
  # A failed dry-run must NEVER lead to an Apply prompt.
  $githubScript=Join-Path $PSScriptRoot 'MEL-Nettoyage-GitHub.ps1'
  if (-not (Test-Path -LiteralPath $githubScript -PathType Leaf)) {
    throw 'MEL_NETTOYAGE_GITHUB_SCRIPT_MISSING'
  }
  $dryRunLog=@(& $githubScript 2>&1)
  foreach ($line in $dryRunLog) { Report "$line" }
  if ($dryRunLog | Where-Object { $_ -match 'ATTENTION:|erreur|ECHEC|BLOQUE' }) {
    throw 'MEL_GITHUB_DRY_RUN_REPORTED_ERRORS'
  }
  if (-not ($dryRunLog | Where-Object { $_ -match 'TERMINE \\(SIMULATION\\)' })) {
    throw 'MEL_GITHUB_DRY_RUN_COMPLETION_NOT_PROVEN'
  }
  $answer=Read-Host 'Simulation terminee. Appliquer les suppressions listees ? (O/N)'
  if ($answer -match '^[oO]$') {
    & $githubScript -Apply 2>&1 | ForEach-Object { Report "$($_)" }
  } else {
    Report 'GITHUB : simulation seulement, rien supprime.'
  }
} catch {
  Report "GITHUB : BLOQUE - $($_.Exception.Message)"
}
Report 'ETAPE 2 - MAX : AUCUNE ANNULATION AVANT PREFLIGHT COMPLET.'
$base=$env:MEL_BASE_URL
$cookie=$env:MEL_SESSION_COOKIE
Report 'MAX : VERROUILLE - backup restaure et pause des producteurs non attestes.'
Report 'ETAPE 3 - INVENTAIRE GLOBAL MEL (lecture seule).'
if ($base -and $cookie -and $base -match '^https://[^/]+$') {
  try {
    $inventory=Invoke-RestMethod -Method Get -Uri "$base/api/gen2/autonomy/maintenance/inspect" -Headers @{Cookie=$cookie;Accept='application/json'} -TimeoutSec 45
    if ($inventory.ok -eq $true -and $inventory.mode -eq 'READ_ONLY') {
      $inventoryFile=Join-Path $ReportDir "MEL-inventaire-D1-$Stamp.json"
      $inventory | ConvertTo-Json -Depth 15 | Set-Content -Path $inventoryFile -Encoding UTF8
      Report "INVENTAIRE : OK - $inventoryFile"
      Report "WORK : $($inventory.work.total) DAG enregistres; baux=$($inventory.leases.status)"
      Report "NETTOYAGE GLOBAL : BLOQUE - $($inventory.blockers -join ', ')"
    } else {
      Report 'INVENTAIRE : REPONSE INVALIDE - aucun succes declare.'
    }
  } catch { Report "INVENTAIRE : ECHEC - $($_.Exception.Message)" }
} else {
  Report 'INVENTAIRE : NON EXECUTE - session MEL indisponible dans Companion.'
}
Report 'ETAPE 4 - WORK, VEILLE, MENTOR, COUNCIL, FOUNDER, PLANIFICATEUR : NON MODIFIES.'
Report 'Ces files doivent etre mises a zero via des APIs de maintenance testees, apres sauvegarde et verification de la pause des producteurs.'
Report 'Pas de suppression de la memoire, des DONE_VERIFIED, livraisons, preuves ou revenus.'
Report 'ETAPE 5 - Aucun workflow, tag ou PR retire automatiquement.'
Report "Fin: $(Get-Date -Format o)"
Report 'ETAT GLOBAL : PARTIEL; aucune affirmation de remise a zero totale.'
Write-Host "Rapport : $Report"
