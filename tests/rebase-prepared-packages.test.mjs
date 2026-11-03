import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { rebasePreparedChange, rebasePreparedPackages } from '../scripts/rebase-prepared-packages.mjs';

const sha = text => createHash('sha256').update(text).digest('hex');

test('an appended mission keeps the prepared package append', () => {
  const committed = 'base\n';
  const current = 'base\nfounder\n';
  const content = 'base\nmanifest\n';
  const next = rebasePreparedChange({ committed, current, content, baseSha: sha(committed) });
  assert.equal(next.content, 'base\nfounder\nmanifest\n');
  assert.equal(next.baseSha, sha(current));
});

test('a package already on the current file is left alone', () => {
  const current = 'same\n';
  assert.equal(rebasePreparedChange({ committed: 'old\n', current, content: current, baseSha: sha('old\n') }), null);
});

test('rebase writes only the drifted package', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mel-rebase-'));
  const committed = 'base\n';
  fs.mkdirSync(path.join(root, 'prepared'));
  fs.mkdirSync(path.join(root, 'tests'));
  fs.writeFileSync(path.join(root, 'tests', 'a.mjs'), 'base\nfounder\n');
  fs.writeFileSync(path.join(root, 'prepared', 'MEL-MANIFEST-09.json'), JSON.stringify({
    roadmap_id: 'MEL-MANIFEST-09',
    changes: [{ path: 'tests/a.mjs', base_sha256: sha(committed), content: 'base\nmanifest\n' }],
  }));
  const written = rebasePreparedPackages(root, { readCommitted: () => committed });
  assert.deepEqual(written, ['prepared/MEL-MANIFEST-09.json']);
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'prepared', 'MEL-MANIFEST-09.json'), 'utf8'));
  assert.equal(pkg.changes[0].content, 'base\nfounder\nmanifest\n');
  assert.equal(pkg.changes[0].base_sha256, sha('base\nfounder\n'));
});
