import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// Ensure a new independent proof cannot be omitted from the release summary.
test('downstream summary fails closed for every exact-SHA proof job', async () => {
  const source = await readFile(new URL('../.github/workflows/release-downstream-proof-decoupled.yml', import.meta.url), 'utf8');
  const match = /^  summary:\n([\s\S]*)$/m.exec(source);
  assert.ok(match, 'final proof summary must exist');
  const block = match[1];
  assert.match(block, /if: always\(\)/);
  const names = ['readiness', 'http', 'capabilities', 'skills', 'browser', 'file', 'sovereignty'];
  const needs = /needs: \[([^\]]+)\]/.exec(block);
  assert.ok(needs, 'summary dependencies must be explicit');
  assert.deepEqual(needs[1].split(',').map(x => x.trim()).sort(), names.slice().sort());
  for (const name of names) {
    const envName = (name === 'sovereignty' ? 'SOV' : name.toUpperCase()) + '_RESULT';
    assert.ok(block.includes('${{ needs.' + name + '.result }}'), 'missing exact job result: ' + name);
    assert.ok(block.includes('test "${' + envName + '}" = "success"'), 'missing fail-closed assertion: ' + name);
  }
});
