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
  # Passe 1 : simulation et sauvegarde, puis confirmation avant toute suppression.
  & "$PSScriptRoot\MEL-Nettoyage-GitHub.ps1" 2>&1 | ForEach-Object { Report "$($_)" }
  $answer=Read-Host 'Appliquer les suppressions listees ci-dessus ? (O/N)'
  if($answer -match '^[oO]'){
    & "$PSScriptRoot\MEL-Nettoyage-GitHub.ps1" -Apply 2>&1 | ForEach-Object { Report "$($_)" }
  } else { Report 'GITHUB : simulation seulement, rien supprime.' }
  if (-not $?) { Report 'GITHUB : ECHEC OU INTERVENTION NECESSAIRE. Consulter RAPPORTS.' }
} catch {Report "GITHUB : BLOQUE : $($_.Exception.Message)"}
Report 'ETAPE 2 - MAX : reinitialisation prise en charge seulement si une session MEL authentifiee est fournie.'
# Les jetons ne sont jamais integres au ZIP. L API MEL doit etre appelee avec une session utilisateur authentifiee.
$base=$env:MEL_BASE_URL
$cookie=$env:MEL_SESSION_COOKIE
if($base -and $cookie -and $base -match '^https://[^/]+$') {
  try {
    # Ce point de terminaison existe et effectue un archivage logique / annulation, pas un DELETE D1.
    $response=Invoke-RestMethod -Method Post -Uri "$base/api/gen2/autonomy/activity/reset" -Headers @{Cookie=$cookie;Accept='application/json'} -ContentType 'application/json' -Body '{}' -TimeoutSec 45
    if($response.ok -eq $true){Report "MAX : OK - anciens jobs actifs annules; epoque=$( $response.reset.epoch ); jobs=$( $response.reset.cancelled_active )"}
    else{Report 'MAX : NON CONFIRME - reponse non valide, aucune reussite revendiquee.'}
  } catch {Report "MAX : BLOQUE - $($_.Exception.Message)"}
} else {
  Report 'MAX : NON EXECUTE - URL MEL_BASE_URL ou session MEL_SESSION_COOKIE absente. Pour le faire directement, utiliser le bouton Vider la liste dans MEL.'
}
Report 'ETAPE 3 - INVENTAIRE GLOBAL MEL (lecture seule).'
if($base -and $cookie -and $base -match '^https://[^/]+
Report 'Ces files doivent etre mises a zero via des APIs ou migrations de maintenance authentifiees et testees, apres sauvegarde D1/R2 et verification des producteurs de jobs.'
Report 'Pas de suppression des donnees de production, memoire, journaux durables, decisions DONE_VERIFIED, livraisons ou revenus.'
Report 'ETAPE 4 - Base repository : aucun fichier, workflow, tag, PR ni archive retire automatiquement par ce lanceur.'
Report 'A verifier ensuite : obsolete workflows, fichiers morts, doublons, bases temporaires, caches R2/D1, et dependances de reprise.'
Report "Fin: $(Get-Date -Format o)"
Report 'ETAT GLOBAL : PARTIEL; aucune affirmation de remise a zero totale sans preuves des endpoints applicatifs.'
Write-Host "Rapport : $Report"
) {
  try {
    $inventory=Invoke-RestMethod -Method Get -Uri "$base/api/gen2/autonomy/maintenance/inspect" -Headers @{Cookie=$cookie;Accept='application/json'} -TimeoutSec 45
    if($inventory.ok -eq $true -and $inventory.mode -eq 'READ_ONLY') {
      $inventoryFile=Join-Path $ReportDir "MEL-inventaire-D1-$Stamp.json"
      $inventory | ConvertTo-Json -Depth 15 | Set-Content -Path $inventoryFile -Encoding UTF8
      Report "INVENTAIRE : OK - $inventoryFile"
      Report "WORK : $($inventory.work.total) DAG enregistres; baux=$($inventory.leases.status)"
      Report "NETTOYAGE GLOBAL : BLOQUE - $($inventory.blockers -join ', ')"
    } else { Report 'INVENTAIRE : REPONSE INVALIDE - aucun succes declare.' }
  } catch { Report "INVENTAIRE : ECHEC - $($_.Exception.Message)" }
} else {
  Report 'INVENTAIRE : NON EXECUTE - session MEL indisponible dans Companion.'
}
Report 'ETAPE 3 - WORK, VEILLE, MENTOR, COUNCIL, FOUNDER, PLANIFICATEUR : NON MODIFIES.'
Report 'Ces files doivent etre mises a zero via des APIs ou migrations de maintenance authentifiees et testees, apres sauvegarde D1/R2 et verification des producteurs de jobs.'
Report 'Pas de suppression des donnees de production, memoire, journaux durables, decisions DONE_VERIFIED, livraisons ou revenus.'
Report 'ETAPE 4 - Base repository : aucun fichier, workflow, tag, PR ni archive retire automatiquement par ce lanceur.'
Report 'A verifier ensuite : obsolete workflows, fichiers morts, doublons, bases temporaires, caches R2/D1, et dependances de reprise.'
Report "Fin: $(Get-Date -Format o)"
Report 'ETAT GLOBAL : PARTIEL; aucune affirmation de remise a zero totale sans preuves des endpoints applicatifs.'
Write-Host "Rapport : $Report"
