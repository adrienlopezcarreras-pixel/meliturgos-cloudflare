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
  // Deletions require -Apply, which the orchestrator passes only after an O answer.
  assert.match(github, /param\(\[switch\]\$Apply\)/);
  assert.match(orchestrator, /Read-Host[\s\S]*MEL-Nettoyage-GitHub\.ps1" -Apply/);
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
    assert.match(source, /^[\\x00-\\x7F]*$/, file + ' must not contain non-ASCII characters');
  }
});
