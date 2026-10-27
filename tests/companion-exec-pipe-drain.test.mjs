import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { CURRENT_COMPANION_ENGINE_VERSION } from '../src/devices/computer-companion-api.js';

test('system.exec drains stdout/stderr while the command runs (no >4 KB pipe deadlock)', async () => {
  for (const file of ['../assets/MEL-Computer-Companion.ps1', '../dist/MEL-Computer-Companion.ps1']) {
    const ps = await readFile(new URL(file, import.meta.url), 'utf8');
    const read = ps.indexOf('$outTask = $p.StandardOutput.ReadToEndAsync()');
    const wait = ps.indexOf('if ($p.WaitForExit([int][Math]::Min(250,$remainingMs)))');
    assert.ok(read > 0 && wait > read, file + ': pipes must be read before waiting');
    assert.doesNotMatch(ps, /WaitForExit\(\$timeoutMs\)\)[^\n]*\n\s*\$out = \$p\.StandardOutput\.ReadToEnd\(\)/);
    assert.match(ps, new RegExp('\\$Version = "' + CURRENT_COMPANION_ENGINE_VERSION.replace(/\./g, '\\.') + '"'));
  }
});
