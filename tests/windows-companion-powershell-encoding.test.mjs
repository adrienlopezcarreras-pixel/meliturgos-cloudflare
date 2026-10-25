import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';

// Windows PowerShell 5.1 reads a BOM-less script as ANSI: one "—" became
// "â€”", whose curly quote broke the Grand nettoyage button (25/10).
test('every Companion PowerShell script is ASCII or UTF-8 with BOM', () => {
  for (const name of readdirSync('windows-companion').filter(file => file.endsWith('.ps1'))) {
    const bytes = readFileSync(`windows-companion/${name}`);
    const bom = bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;
    assert.ok(bom || bytes.every(byte => byte < 0x80), name);
  }
});

test('restarts and updates never leave a stale cleanup script installed', () => {
  const cs = readFileSync('windows-companion/MEL-Companion.cs', 'utf8');
  assert.match(cs, /File\.GetLastWriteTimeUtc\(from\) > File\.GetLastWriteTimeUtc\(to\)/);
  const update = readFileSync('windows-companion/Update-MEL-Computer-Companion.ps1', 'utf8');
  assert.match(update, /'MEL-Sauvegarde-Locale-D1\.ps1'\)\) \{/);
  assert.match(update, /COMPANION_PACKAGE_SCRIPT_INVALID/);
  assert.ok(update.indexOf('$scriptsUpdated') < update.indexOf('deja a jour'));
});

test('native npm/wrangler stderr notices never abort the local backup', () => {
  const backup = readFileSync('windows-companion/MEL-Sauvegarde-Locale-D1.ps1', 'utf8');
  assert.equal((backup.match(/& (npx|node) /g) || []).length, (backup.match(/Invoke-Native \{ & (npx|node) /g) || []).length);
  const cleanup = readFileSync('windows-companion/MEL-Grand-Nettoyage.ps1', 'utf8');
  assert.match(cleanup, /\$backupExit=\$LASTEXITCODE/);
});

test('the local backup never waits on a hidden prompt and streams its log', () => {
  const backup = readFileSync('windows-companion/MEL-Sauvegarde-Locale-D1.ps1', 'utf8');
  assert.match(backup, /\$env:WRANGLER_SEND_METRICS = 'false'/);
  assert.match(backup, /\$env:CI = 'true'/);
  assert.ok(backup.indexOf("$env:CI = 'true'") < backup.indexOf('d1 export'));
  const cleanup = readFileSync('windows-companion/MEL-Grand-Nettoyage.ps1', 'utf8');
  assert.match(cleanup, /& \$backupScript 2>&1 \| ForEach-Object \{ Report "\$_" \}/);
});
