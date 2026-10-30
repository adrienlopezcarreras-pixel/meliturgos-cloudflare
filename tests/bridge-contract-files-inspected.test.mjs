import test from 'node:test';
import assert from 'node:assert/strict';
import { uniquePaths } from '../src/evolution/autonomy-bridge-preparer.js';

// 30/10: FOUNDER-07's planner inspected neighbouring files but not the
// contract's src/backup/restore-service.js; every edit of it was refused.
test('the coder always receives the roadmap contract files first', () => {
  const paths = uniquePaths({ roadmap_id: 'MEL-FOUNDER-07', inspected_files: [
    { path: 'tests/restore-service.test.mjs' }, { path: 'src/conversations/sync-service.js' }] });
  assert.deepEqual(paths.slice(0, 2), ['src/backup/restore-service.js', 'tests/restore-service.test.mjs']);
  assert.ok(paths.includes('src/conversations/sync-service.js'));
  assert.equal(new Set(paths).size, paths.length);
  assert.deepEqual(uniquePaths({ inspected_files: [{ path: 'a.js' }] }), ['a.js']);
});
