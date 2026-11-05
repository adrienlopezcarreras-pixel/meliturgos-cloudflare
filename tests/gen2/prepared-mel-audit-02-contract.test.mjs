import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const project = fileURLToPath(new URL('../../', import.meta.url));
const sha256 = source => createHash('sha256').update(source, 'utf8').digest('hex');

test('MEL-AUDIT-02 prepared package is a bounded, syntactically valid and base-pinned code/test change', () => {
  const pkg = JSON.parse(readFileSync(join(project, 'prepared/MEL-AUDIT-02.json'), 'utf8'));
  assert.equal(pkg.roadmap_id, 'MEL-AUDIT-02');
  assert.deepEqual(pkg.tests, ['test']);
  assert.deepEqual(pkg.changes.map(row => row.path), [
    'src/diagnostics/development-audit.js', 'tests/development-audit.test.mjs',
  ]);
  const temp = mkdtempSync(join(tmpdir(), 'mel-audit-02-'));
  try {
    for (const [index, change] of pkg.changes.entries()) {
      const base = readFileSync(join(project, change.path), 'utf8');
      // The file may be either pending (exact approved base) or already applied
      // after MAX legitimately promotes the package. Both are valid states.
      if (change.content !== base) {
        assert.equal(change.base_sha256, sha256(base), change.path + ' must be pinned to the exact approved base');
      }
      const candidate = join(temp, index + '.mjs');
      writeFileSync(candidate, change.content, 'utf8');
      const syntax = spawnSync(process.execPath, ['--check', candidate], { encoding: 'utf8', timeout: 10000 });
      assert.equal(syntax.status, 0, change.path + ': ' + (syntax.stderr || syntax.error || 'syntax failure'));
    }
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
  assert.match(pkg.changes[0].content, /DELETE FROM mel_development_audit_findings WHERE week_start=\?/);
  assert.match(pkg.changes[0].content, /db\.batch\(writes\)/);
  assert.match(pkg.changes[1].content, /refresh removes stale findings/);
});
