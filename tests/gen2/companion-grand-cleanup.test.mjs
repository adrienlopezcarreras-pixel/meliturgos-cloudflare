import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('Companion ships the owner-run grand cleanup behind a button, simulation first', async () => {
  const [native, build, orchestrator, github] = await Promise.all([
    read('windows-companion/MEL-Companion.cs'),
    read('scripts/build-windows-release.ps1'),
    read('windows-companion/MEL-Grand-Nettoyage.ps1'),
    read('windows-companion/MEL-Nettoyage-GitHub.ps1'),
  ]);
  assert.match(native, /ActionButton\("Grand nettoyage",160,RunGrandCleanup\)/);
  assert.match(build, /MEL-Grand-Nettoyage\.ps1","MEL-Nettoyage-GitHub\.ps1","MEL-Restaurer-Branches\.ps1/);
  // Never run on install: InstallFiles only copies.
  const install = native.slice(native.indexOf('public static void InstallFiles('), native.indexOf('public static void ConfigureStartup('));
  assert.doesNotMatch(install, /Process\.Start\(.*Cleanup/);
  // Destructive GitHub operations are unavailable until the full preflight exists.
  assert.match(github, /param\(\[switch\]\$Apply\)/);
  assert.doesNotMatch(orchestrator, /\$githubScript -Apply/);
  assert.ok(orchestrator.indexOf('maintenance/inspect') < orchestrator.indexOf('MEL-Nettoyage-GitHub.ps1'));
  for (const prefix of ['archive/', 'release/', 'candidate/']) assert.ok(github.includes(`'${prefix}'`));
});


test('cleanup scripts are ASCII-safe for Windows PowerShell 5.1 without UTF-8 BOM', async () => {
  const files = [
    'windows-companion/MEL-Grand-Nettoyage.ps1',
    'windows-companion/MEL-Nettoyage-GitHub.ps1',
    'windows-companion/MEL-Restaurer-Branches.ps1',
  ];
  for (const file of files) {
    const source = await read(file);
    assert.match(source, /^[\x00-\x7F]*$/, file + ' must not contain non-ASCII characters');
  }
});

test('Companion grand cleanup inventories global D1 without calling reset endpoints', async () => {
  const source=await read('windows-companion/MEL-Grand-Nettoyage.ps1');
  assert.match(source, /\/api\/gen2\/autonomy\/maintenance\/inspect/);
  assert.match(source, /MEL-inventaire-D1-\$Stamp\.json/);
  assert.match(source, /NETTOYAGE GLOBAL : BLOQUE/);
});

test('Grand nettoyage never resets MAX before verified global restore preflight', async () => {
 const source=await read('windows-companion/MEL-Grand-Nettoyage.ps1');
 assert.doesNotMatch(source, /Invoke-RestMethod[^\n]*\/api\/gen2\/autonomy\/activity\/reset/);
 assert.match(source, /MAX : NON MODIFIE/);
 assert.match(source, /maintenance\/inspect/);
});

test('GitHub cleanup fail closed unless dry-run confirms success and no errors', async () => {
  const src=await read('windows-companion/MEL-Grand-Nettoyage.ps1');
  assert.match(src,/MEL_GITHUB_DRY_RUN_REPORTED_ERRORS/);
  assert.match(src,/MEL_GITHUB_DRY_RUN_COMPLETION_NOT_PROVEN/);
  assert.match(src,/TERMINE/);
  assert.doesNotMatch(src,/-Apply/);
  assert.doesNotMatch(src,/Read-Host/);
});

test('Companion reports actual global maintenance lease and isolated restore status', async () => {
 const source=await read('windows-companion/MEL-Grand-Nettoyage.ps1');
 assert.match(source,/inventory\.maintenance_fence/);
 assert.match(source,/EXPIRED_MAINTENANCE_REQUIRES_RECOVERY/);
 assert.match(source,/inventory\.backup\.restore_tested/);
 assert.match(source,/inventory\.reset_available/);
 assert.doesNotMatch(source,/\$githubScript -Apply/);
});

test('read only Companion report never claims to have paused producers', async () => {
 const source=await read('windows-companion/MEL-Grand-Nettoyage.ps1');
 assert.match(source,/Aucun producteur suspendu par ce script/);
 assert.match(source,/Aucun verrou active/);
 assert.doesNotMatch(source,/developpement en pause/);
});

test('one-click cleanup first proves a local D1 backup with an isolated restore, never an R2 copy', async () => {
  const { readFile } = await import('node:fs/promises');
  const cleanup = await readFile(new URL('../../windows-companion/MEL-Grand-Nettoyage.ps1', import.meta.url), 'utf8');
  const backup = await readFile(new URL('../../windows-companion/MEL-Sauvegarde-Locale-D1.ps1', import.meta.url), 'utf8');
  const companion = await readFile(new URL('../../windows-companion/MEL-Companion.cs', import.meta.url), 'utf8');
  assert.ok(cleanup.indexOf('ETAPE 0 - SAUVEGARDE LOCALE D1') < cleanup.indexOf('ETAPE 1 - PREFLIGHT'));
  assert.match(companion, /"MEL-Sauvegarde-Locale-D1\.ps1"/);
  assert.match(backup, /wrangler@4 d1 export \$Database --remote --output \$Sql/);
  assert.match(backup, /PRAGMA integrity_check/);
  assert.match(backup, /isolated_restore_tested = \$true/);
  assert.doesNotMatch(backup, /r2 object (put|delete)|DELETE FROM|DROP TABLE|Write-Output[^\n]*CLOUDFLARE_API_TOKEN\)/i);
});
