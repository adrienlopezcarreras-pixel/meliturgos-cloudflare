# MEL - Nettoyage prudent en un double-clic. Aucun secret n'est demande ni journalise.
# Necessite GitHub CLI (gh) authentifie sur le compte ayant les droits sur le depot.
param([switch]$Apply)
$ErrorActionPreference='Stop'
$Repo='adrienlopezcarreras-pixel/meliturgos-cloudflare'
$MinimumCancelledRunDays=90
$MinimumCacheDays=45
$MinimumArtifactDays=90
$MaxDeletesPerCategory=5000
$ReportDir=Join-Path $PSScriptRoot 'RAPPORTS'
New-Item -ItemType Directory -Force -Path $ReportDir | Out-Null
$Stamp=Get-Date -Format 'yyyyMMdd-HHmmss'
$Log=Join-Path $ReportDir "MEL-grand-nettoyage-$Stamp.log"
$Summary=[ordered]@{mode=$(if($Apply){'APPLY'}else{'SIMULATION'});date=(Get-Date).ToString('o');repo=$Repo;deleted_branches=@();deleted_branch_shas=@();deleted_caches=@();deleted_cancelled_runs=@();deleted_artifacts=@();preserved=@();errors=@();open_prs=@();workflows=@();notes=@()}
function Note([string]$m) { Write-Host $m; Add-Content -Path $Log -Value $m -Encoding utf8 }
function Api([string]$path,[string]$method='GET') {
  # No trailing slash for the repository itself: "repos/<repo>/" is a 404.
  $endpoint= if($path){"repos/$Repo/$path"}else{"repos/$Repo"}
  $argsList=@('api','--method',$method,'-H','Accept: application/vnd.github+json',$endpoint)
  $result=& gh @argsList 2>&1
  if($LASTEXITCODE -ne 0){throw "GitHub API erreur pour ${method} $path : $result"}
  $raw=($result | Out-String).Trim()
  if(!$raw){ return $null }
  return ($raw | ConvertFrom-Json)
}
function Pages([string]$path){
  $all=@()
  for($page=1;$page -le 100;$page++){
    $sep= if($path.Contains('?')){'&'}else{'?'}
    $obj=Api "$path${sep}per_page=100&page=$page"
    if($null -eq $obj){break}
    $rows=@($obj)
    if($rows.Count -eq 0){break}
    $all+= $rows
    if($rows.Count -lt 100){break}
  }
  return ,$all
}
function Older([string]$iso,[int]$days){
  if(!$iso){return $false}
  return ([datetimeoffset]::Parse($iso) -lt [datetimeoffset]::UtcNow.AddDays(-$days))
}
function Skip([string]$what,[string]$why){$script:Summary.preserved+=@{item=$what;reason=$why}}
function Failure([string]$what,[string]$why){$script:Summary.errors+=@{item=$what;reason=$why};Note "ATTENTION: $what - $why"}
if(!(Get-Command gh -ErrorAction SilentlyContinue)){throw 'GitHub CLI (gh) absent. Installer depuis https://cli.github.com puis executer gh auth login.'}
& gh auth status 1>$null 2>$null
if($LASTEXITCODE -ne 0){throw 'GitHub CLI non authentifie : executer gh auth login puis relancer.'}
Note "MEL - GRAND NETTOYAGE - $Repo"
Note 'Mode securise : pas de mutation de main, candidate, release, tags, fichiers, workflows, PR ou sauvegardes.'
$info=Api ''
$default=$info.default_branch
$branches=Pages 'branches'
$prs=Pages 'pulls?state=open'
$Summary.open_prs=@($prs | ForEach-Object {@{number=$_.number;title=$_.title;head=$_.head.ref;base=$_.base.ref}})
$active=@{}
foreach($pr in $prs){$active[$pr.base.ref]=$true;if($pr.head.repo -and $pr.head.repo.full_name -eq $Repo){$active[$pr.head.ref]=$true}}
# Les sauvegardes et branches de production sont preservees meme fusionnees.
$protectedPrefixes=@('archive/','backup','baseline/','release/','candidate/','teacher-bridge/','hotfix/','production/','prod/','stable/','restore/','recovery/','snapshot/')
$protectedNames=@($default,'main','master','candidate/mel-clean-autonomy','teacher-bridge/runtime')
# Les PR fusionnees en squash ne laissent pas la branche ancetre de main :
# une branche dont le dernier commit est exactement la tete d une PR fusionnee est integree.
$mergedHeads=@{}
foreach($pr in (Pages 'pulls?state=closed')){ if($pr.merged_at){$mergedHeads["$($pr.head.ref)|$($pr.head.sha)"]=$pr.number} }
Note "Branches reperees : $(@($branches).Count). PR ouvertes : $(@($prs).Count). Tetes de PR fusionnees : $($mergedHeads.Count)."
$candidates=@()
foreach($b in $branches){
  $name=[string]$b.name
  if($protectedNames -contains $name -or $active.ContainsKey($name) -or $b.protected){Skip "branch:$name" 'protegee/ou PR ouverte';continue}
  $prefixProtected=$false
  foreach($prefix in $protectedPrefixes){if($name.StartsWith($prefix)){$prefixProtected=$true;break}}
  if($prefixProtected){Skip "branch:$name" 'archive/backup/production';continue}
  $key="$name|$($b.commit.sha)"
  if($mergedHeads.ContainsKey($key)){$candidates+=@{name=$name;sha=$b.commit.sha;why="PR #$($mergedHeads[$key]) fusionnee"};continue}
  try {
    $encoded=[uri]::EscapeDataString($name)
    # main...branch : behind ou identical signifie que la branche est un ancetre de main.
    $cmp=Api "compare/$default...$encoded"
    if($cmp.status -in @('behind','identical')){$candidates+=@{name=$name;sha=$b.commit.sha;why='ancetre de main'}}
    else{Skip "branch:$name" "non fusionnee: $($cmp.status)"}
  } catch { Failure "branch:$name" $_.Exception.Message }
}
Note "Branches integrees supprimables : $($candidates.Count)."
# Sauvegarde nom -> SHA ecrite AVANT toute suppression : RESTAURER_BRANCHES.ps1 la rejoue.
$backup=Join-Path $ReportDir "MEL-branches-sauvegarde-$Stamp.json"
@($candidates | ForEach-Object {@{name=$_.name;sha=$_.sha;why=$_.why}}) | ConvertTo-Json -Depth 4 | Set-Content -Path $backup -Encoding UTF8
Note "Sauvegarde des branches : $backup"
if(!$Apply){Note 'SIMULATION : aucune suppression. Relancer avec -Apply pour appliquer.'}
foreach($c in $candidates){
  if(!$Apply){break}
  $name=$c.name;$encoded=[uri]::EscapeDataString($name)
  try {
    $before=Api "branches/$encoded"
    if(!$before -or $before.commit.sha -ne $c.sha){Skip "branch:$name" 'modifiee pendant le controle';continue}
    if($Summary.deleted_branches.Count -ge $MaxDeletesPerCategory){Skip "branch:$name" 'limite de securite';continue}
    Api "git/refs/heads/$encoded" 'DELETE' | Out-Null
    $Summary.deleted_branches+=$name;$Summary.deleted_branch_shas+=@{name=$name;sha=$c.sha}
    Note "SUPPRIMEE branche : $name ($($c.why))"
  } catch { Failure "branch:$name" $_.Exception.Message }
}
# Caches inactifs : reconstruisibles par la CI, sans toucher aux donnees durables.
try {
  $caches=@()
  for($page=1;$page -le 30;$page++){
    $obj=Api "actions/caches?per_page=100&page=$page"
    $rows=@($obj.actions_caches)
    if(!$rows.Count){break}
    $caches+=$rows
    if($rows.Count -lt 100){break}
  }
  foreach($cache in $caches){
    if(!(Older $cache.last_accessed_at $MinimumCacheDays)){continue}
    if($Summary.deleted_caches.Count -ge $MaxDeletesPerCategory){break}
    if(!$Apply){continue};try {Api "actions/caches/$($cache.id)" 'DELETE' | Out-Null;$Summary.deleted_caches+=$cache.id;Note "SUPPRIME cache : $($cache.id)"}catch{Failure "cache:$($cache.id)" $_.Exception.Message}
  }
}catch{Failure 'inventaire caches' $_.Exception.Message}
# Anciens runs annules : jamais les succes, echecs, releases ou preuves des branches canoniques.
try {
  $runs=@()
  for($page=1;$page -le 30;$page++){
    $obj=Api "actions/runs?per_page=100&page=$page"
    $rows=@($obj.workflow_runs)
    if(!$rows.Count){break}
    $runs+=$rows
    if($rows.Count -lt 100){break}
  }
  foreach($run in $runs){
    if($run.status -ne 'completed' -or $run.conclusion -ne 'cancelled' -or !(Older $run.created_at $MinimumCancelledRunDays)){continue}
    if($run.head_branch -in $protectedNames -or $run.head_branch -like 'release/*' -or $run.name -match '(?i)backup|restore|production|release|evidence|proof'){continue}
    if($Summary.deleted_cancelled_runs.Count -ge $MaxDeletesPerCategory){break}
    if(!$Apply){continue};try{Api "actions/runs/$($run.id)" 'DELETE' | Out-Null;$Summary.deleted_cancelled_runs+=$run.id;Note "SUPPRIME run annule : $($run.id)"}catch{Failure "run:$($run.id)" $_.Exception.Message}
  }
}catch{Failure 'inventaire runs' $_.Exception.Message}
# Artefacts anciens de branches temporaires uniquement ; les preuves/sauvegardes restent.
try {
  $arts=@()
  for($page=1;$page -le 30;$page++){
    $obj=Api "actions/artifacts?per_page=100&page=$page"
    $rows=@($obj.artifacts)
    if(!$rows.Count){break}
    $arts+=$rows
    if($rows.Count -lt 100){break}
  }
  foreach($art in $arts){
    if(!(Older $art.created_at $MinimumArtifactDays)){continue}
    if($art.name -match '(?i)backup|restore|archive|evidence|proof|release|snapshot|dataset|lora|training'){continue}
    $br=[string]$art.workflow_run.head_branch
    if(!$br -or $br -in $protectedNames -or $br -like 'release/*' -or $br -like 'archive/*'){continue}
    if($Summary.deleted_artifacts.Count -ge $MaxDeletesPerCategory){break}
    if(!$Apply){continue};try {Api "actions/artifacts/$($art.id)" 'DELETE' | Out-Null;$Summary.deleted_artifacts+=$art.id;Note "SUPPRIME ancien artefact temporaire : $($art.id)"}catch{Failure "artifact:$($art.id)" $_.Exception.Message}
  }
}catch{Failure 'inventaire artefacts' $_.Exception.Message}
try {$workflows=Pages 'actions/workflows';$Summary.workflows=@($workflows | ForEach-Object {@{id=$_.id;name=$_.name;path=$_.path;state=$_.state}})}catch{Failure 'inventaire workflows' $_.Exception.Message}
$Summary.notes=@('Les PR ouvertes, historiques, fichiers, workflows, tags et anciennes branches de sauvegarde sont seulement inventories/preserves : leur suppression necessite une revue du contenu et des dependances.','Aucune nouvelle fonctionnalite ni release ne doit etre lancee pendant la pause MEL.','Le nettoyage ne touche pas aux ressources Cloudflare ni aux donnees de production.')
$json=Join-Path $ReportDir "MEL-grand-nettoyage-$Stamp.json"
$Summary | ConvertTo-Json -Depth 12 | Set-Content -Path $json -Encoding UTF8
Note "TERMINE ($($Summary.mode)) : $($candidates.Count) branches eligibles ; $($Summary.deleted_branches.Count) branches, $($Summary.deleted_caches.Count) caches, $($Summary.deleted_cancelled_runs.Count) runs annules, $($Summary.deleted_artifacts.Count) artefacts supprimes ; $($Summary.errors.Count) erreurs."
Note "Rapport detaille : $json"
