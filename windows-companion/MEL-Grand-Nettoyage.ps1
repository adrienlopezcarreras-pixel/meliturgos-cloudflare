# MEL - orchestrateur de maintenance a un clic. Operation non destructive pour les donnees applicatives.
$ErrorActionPreference='Stop'
$ReportDir=Join-Path $PSScriptRoot 'RAPPORTS'
New-Item -ItemType Directory -Force -Path $ReportDir | Out-Null
$Stamp=Get-Date -Format 'yyyyMMdd-HHmmss'
$Report=Join-Path $ReportDir "MEL-NETTOYAGE-TOTAL-$Stamp.txt"
function Report([string]$Line) { $Line | Tee-Object -FilePath $Report -Append }
Report 'MEL - Diagnostic de grand nettoyage. Aucun producteur suspendu par ce script.'
Report "Debut: $(Get-Date -Format o)"
Report 'ETAPE 0 - SAUVEGARDE LOCALE D1 + restauration isolee de test (aucune copie R2, aucune depense).'
try {
  $backupScript=Join-Path $PSScriptRoot 'MEL-Sauvegarde-Locale-D1.ps1'
  if (-not (Test-Path -LiteralPath $backupScript -PathType Leaf)) { throw 'MEL_SAUVEGARDE_LOCALE_SCRIPT_MISSING' }
  $ErrorActionPreference='Continue'
  $backupLog=@(& $backupScript 2>&1)
  $backupExit=$LASTEXITCODE
  $ErrorActionPreference='Stop'
  foreach ($line in $backupLog) { Report "$line" }
  if ($backupExit -eq 0) { Report 'SAUVEGARDE LOCALE : PROUVEE (export + restauration isolee).' }
  else { Report 'SAUVEGARDE LOCALE : NON PROUVEE - aucune suppression possible.' }
} catch { Report "SAUVEGARDE LOCALE : BLOQUEE - $($_.Exception.Message)" }
Report 'ETAPE 1 - PREFLIGHT MEL : aucune suppression avant inspection.'
$base=$env:MEL_BASE_URL
$cookie=$env:MEL_SESSION_COOKIE
Report 'MAX : NON MODIFIE - aucune suspension ou remise a zero declenchee.'
Report 'PREFLIGHT - INVENTAIRE GLOBAL MEL (lecture seule).'
if ($base -and $cookie -and $base -match '^https://[^/]+$') {
  try {
    $inventory=Invoke-RestMethod -Method Get -Uri "$base/api/gen2/autonomy/maintenance/inspect" -Headers @{Cookie=$cookie;Accept='application/json'} -TimeoutSec 45
    if ($inventory.ok -eq $true -and $inventory.mode -eq 'READ_ONLY') {
      $inventoryFile=Join-Path $ReportDir "MEL-inventaire-D1-$Stamp.json"
      $inventory | ConvertTo-Json -Depth 15 | Set-Content -Path $inventoryFile -Encoding UTF8
      Report "INVENTAIRE : OK - $inventoryFile"
      Report "WORK : $($inventory.work.total) DAG enregistres; baux=$($inventory.leases.status)"
      $fence=$inventory.maintenance_fence
      if ($null -eq $fence) {
        Report 'VERROU GLOBAL : ETAT INCONNU - intervention requise.'
      } elseif ($fence.paused -eq $true) {
        Report "VERROU GLOBAL : ACTIF - $($fence.reason)"
        if ($fence.reason -eq 'EXPIRED_MAINTENANCE_REQUIRES_RECOVERY') {
          Report 'ALERTE : bail expire. Recuperation verifiee necessaire avant reprise des modules.'
        }
      } else {
        Report 'VERROU GLOBAL : LIBRE - aucune pause de nettoyage globale.'
      }
      Report "SAUVEGARDE : $($inventory.backup.status); restauration isolee=$($inventory.backup.restore_tested)"
      if ($inventory.reset_available -ne $true) {
        Report 'AUCUNE SUPPRESSION AUTORISEE : le nettoyage global reste indisponible.'
      }
      Report "NETTOYAGE GLOBAL : BLOQUE - $($inventory.blockers -join ', ')"
    } else {
      Report 'INVENTAIRE : REPONSE INVALIDE - aucun succes declare.'
    }
  } catch { Report "INVENTAIRE : ECHEC - $($_.Exception.Message)" }
} else {
  Report 'INVENTAIRE : NON EXECUTE - session MEL indisponible dans Companion.'
}
Report 'ETAPE 2 - Nettoyage GitHub : INVENTAIRE UNIQUEMENT.'
Report 'GitHub : aucune suppression appliquee tant que le preflight global est bloque.'
try {
  $githubScript=Join-Path $PSScriptRoot 'MEL-Nettoyage-GitHub.ps1'
  if (-not (Test-Path -LiteralPath $githubScript -PathType Leaf)) {
    throw 'MEL_NETTOYAGE_GITHUB_SCRIPT_MISSING'
  }
  $dryRunLog=@(& $githubScript 2>&1)
  foreach ($line in $dryRunLog) { Report "$line" }
  if ($dryRunLog | Where-Object { $_ -match 'ATTENTION:|erreur|ECHEC|BLOQUE' }) {
    throw 'MEL_GITHUB_DRY_RUN_REPORTED_ERRORS'
  }
  if (-not ($dryRunLog | Where-Object { $_ -match 'TERMINE \(SIMULATION\)' })) {
    throw 'MEL_GITHUB_DRY_RUN_COMPLETION_NOT_PROVEN'
  }
  Report 'GITHUB : simulation validee, aucune suppression appliquee.'
} catch {
  Report "GITHUB : BLOQUE - $($_.Exception.Message)"
}
Report 'ETAPE 3 - MAX : AUCUNE ANNULATION AVANT PREFLIGHT COMPLET.'
Report 'MAX : NON MODIFIE - restauration et arret global non attestes.'
Report 'ETAPE 4 - WORK, VEILLE, MENTOR, COUNCIL, FOUNDER, PLANIFICATEUR : NON MODIFIES.'
Report 'Ces files doivent etre mises a zero via des APIs de maintenance testees, apres sauvegarde et verification de la pause des producteurs.'
Report 'Pas de suppression de la memoire, des DONE_VERIFIED, livraisons, preuves ou revenus.'
Report 'ETAPE 5 - Aucun workflow, tag ou PR retire automatiquement. Aucun verrou active.'
Report "Fin: $(Get-Date -Format o)"
Report 'ETAT GLOBAL : PARTIEL; aucune affirmation de remise a zero totale.'
Write-Host "Rapport : $Report"
