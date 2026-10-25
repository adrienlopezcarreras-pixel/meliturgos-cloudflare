# MEL - sauvegarde locale de D1 avant nettoyage, puis restauration isolee de test.
# Le nettoyage ne vise que des lignes D1 temporaires : medias, documents et R2
# ne sont jamais supprimes, donc la sauvegarde utile est D1. Copie locale :
# aucun stockage R2 supplementaire, aucune depense. Lecture seule cote MEL.
# Prerequis : Node.js (fourni avec wrangler), CLOUDFLARE_API_TOKEN et
# CLOUDFLARE_ACCOUNT_ID dans l'environnement (jamais affiches).
param([string]$OutDir = (Join-Path $PSScriptRoot 'SAUVEGARDES'))
$ErrorActionPreference = 'Stop'
$Database = 'meliturgos-memory'
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
$Stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$Sql = Join-Path $OutDir "MEL-D1-$Stamp.sql"
$Restored = Join-Path $OutDir "MEL-D1-$Stamp-restauration-test.sqlite"
$Proof = Join-Path $OutDir "MEL-D1-$Stamp-preuve.json"

if (-not $env:CLOUDFLARE_API_TOKEN -or -not $env:CLOUDFLARE_ACCOUNT_ID) {
  Write-Output 'SAUVEGARDE D1 : NON EXECUTEE - definir CLOUDFLARE_API_TOKEN et CLOUDFLARE_ACCOUNT_ID.'
  exit 2
}
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Output 'SAUVEGARDE D1 : NON EXECUTEE - Node.js introuvable.'
  exit 2
}

Write-Output "SAUVEGARDE D1 : export de $Database vers $Sql (peut prendre plusieurs minutes)."
& npx --yes wrangler@4 d1 export $Database --remote --output $Sql 2>&1 | ForEach-Object { "  $_" }
if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $Sql)) {
  Write-Output 'SAUVEGARDE D1 : ECHEC de l''export - aucun nettoyage possible.'
  exit 1
}
$Hash = (Get-FileHash -Algorithm SHA256 -LiteralPath $Sql).Hash.ToLower()
$Size = (Get-Item -LiteralPath $Sql).Length
Write-Output "SAUVEGARDE D1 : $Size octets, sha256 $Hash"

# Restauration dans une base SQLite locale neuve, isolee de la production.
$Restore = @'
const fs = require('fs'), readline = require('readline');
const { DatabaseSync } = require('node:sqlite');
const [sqlFile, dbFile] = process.argv.slice(-2);
(async () => {
  fs.rmSync(dbFile, { force: true });
  const db = new DatabaseSync(dbFile);
  let buffer = '', statements = 0;
  for await (const line of readline.createInterface({ input: fs.createReadStream(sqlFile, 'utf8'), crlfDelay: Infinity })) {
    buffer += line + '\n';
    // A statement ends on ';' outside a string literal ('' escapes keep parity).
    if (!line.trimEnd().endsWith(';') || (buffer.split("'").length - 1) % 2) continue;
    db.exec(buffer); statements++; buffer = '';
  }
  if (buffer.trim()) throw new Error('RESTORE_TRAILING_STATEMENT_INCOMPLETE');
  const integrity = db.prepare('PRAGMA integrity_check').get();
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY name").all().map(row => row.name);
  const counts = Object.fromEntries(tables.map(name => [name, db.prepare(`SELECT COUNT(*) AS n FROM "${name.replace(/"/g, '""')}"`).get().n]));
  console.log(JSON.stringify({ statements, integrity: Object.values(integrity)[0], tables: tables.length, counts }));
})().catch(error => { console.error(String(error?.message || error)); process.exit(1); });
'@
$RestoreScript = Join-Path $OutDir 'restore-test.cjs'
Set-Content -LiteralPath $RestoreScript -Value $Restore -Encoding UTF8
$restoreJson = & node $RestoreScript $Sql $Restored 2>$null
if ($LASTEXITCODE -ne 0) { $restoreJson = & node --experimental-sqlite $RestoreScript $Sql $Restored }
if ($LASTEXITCODE -ne 0) {
  Write-Output 'RESTAURATION TEST : ECHEC - sauvegarde NON prouvee, aucun nettoyage possible.'
  exit 1
}
$restore = $restoreJson | Select-Object -Last 1 | ConvertFrom-Json
if ($restore.integrity -ne 'ok' -or $restore.tables -lt 1) {
  Write-Output "RESTAURATION TEST : INTEGRITE $($restore.integrity) - sauvegarde NON prouvee."
  exit 1
}

# Comparaison avec la production : un ecart vient d'ecritures pendant l'export.
$names = @($restore.counts.PSObject.Properties.Name)
$union = ($names | ForEach-Object { "SELECT '$($_ -replace "'", "''")' AS t, COUNT(*) AS n FROM `"$($_ -replace '"', '""')`"" }) -join ' UNION ALL '
$remote = (& npx --yes wrangler@4 d1 execute $Database --remote --json --command $union 2>$null | Out-String | ConvertFrom-Json)[0].results
$diff = @()
foreach ($row in $remote) {
  $local = [int64]$restore.counts.($row.t)
  if ($local -ne [int64]$row.n) { $diff += "$($row.t): sauvegarde $local / production $($row.n)" }
}
[ordered]@{
  schema = 'mel.local-d1-backup-proof/v1'; database = $Database; created_at = (Get-Date).ToUniversalTime().ToString('o')
  sql_file = $Sql; sha256 = $Hash; bytes = $Size; restored_file = $Restored
  statements = $restore.statements; integrity = $restore.integrity; tables = $restore.tables
  count_differences = $diff; isolated_restore_tested = $true
} | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $Proof -Encoding UTF8
Write-Output "RESTAURATION TEST : OK - $($restore.tables) tables, integrite ok, $($restore.statements) instructions."
if ($diff.Count) { Write-Output "ECARTS (ecritures pendant l'export) : $($diff -join '; ')" }
Write-Output "PREUVE : $Proof"
exit 0
