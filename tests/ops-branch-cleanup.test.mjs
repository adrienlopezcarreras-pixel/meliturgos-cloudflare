import test from 'node:test';
import assert from 'node:assert/strict';
import { deletableBranches } from '../scripts/ops/branch-cleanup.mjs';

test('branch cleanup keeps protected, open and unmerged branches', () => {
  const branches = [
    { name: 'main', sha: 'm' }, { name: 'candidate/x', sha: 'c' }, { name: 'release/r', sha: 'r' },
    { name: 'claude/open', sha: 'o' }, { name: 'claude/squashed', sha: 's' },
    { name: 'claude/moved-after-merge', sha: 'new' }, { name: 'fix/ancestor', sha: 'a' }, { name: 'fix/wip', sha: 'w' },
  ];
  const out = deletableBranches({
    branches,
    openHeads: new Set(['claude/open']),
    mergedHeads: new Map([['claude/squashed', 's'], ['claude/moved-after-merge', 'old'], ['claude/open', 'o']]),
    ancestorOfMain: name => name === 'fix/ancestor' || name === 'main',
  });
  assert.deepEqual(out.map(b => b.name), ['claude/squashed', 'fix/ancestor']);
});
