import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectCodeIntegrity } from '../src/capabilities/code-integrity-capability.js';

const SHA = '0123456789abcdef0123456789abcdef01234567';

test('code.integrity accepts the object shape returned by GitHub code reader head()', async () => {
  const reader = {
    repository: 'adrienlopezcarreras-pixel/meliturgos-cloudflare',
    branch: 'candidate/mel-clean-autonomy',
    async head() { return { sha: SHA, branch: this.branch, repository: this.repository }; },
    async read(path) { return { path, content: 'export const ok = true;\n', sha: 'blob-sha' }; },
  };

  const result = await inspectCodeIntegrity({
    reader,
    paths: ['src/index.js'],
    expectedHead: SHA,
  });

  assert.equal(result.status, 'PASS');
  assert.equal(result.head, SHA);
  assert.equal(result.head_matches, true);
  assert.equal(result.checked_files, 1);
  assert.deepEqual(result.failures, []);
});

test('code.integrity preserves compatibility with string head() implementations', async () => {
  const reader = {
    repository: 'local/test',
    branch: 'candidate/test',
    async head() { return SHA; },
    async read(path) { return { path, content: 'clean\n', sha: 'blob-sha' }; },
  };

  const result = await inspectCodeIntegrity({ reader, paths: ['package.json'], expectedHead: SHA });
  assert.equal(result.status, 'PASS');
  assert.equal(result.head, SHA);
  assert.equal(result.head_matches, true);
});
