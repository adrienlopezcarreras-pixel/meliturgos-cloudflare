import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('Code activity window shows server evidence with expandable details and live polling', async () => {
  const source = await readFile(new URL('../src/pages/full-interface-v2.js', import.meta.url), 'utf8');
  assert.match(source, /function melCodeRefreshActivity\(\)/);
  assert.match(source, /jfetch\('\/api\/gen2\/autonomy\/activity'\)/);
  assert.match(source, /data\.timeline/);
  assert.match(source, /data\.jobs/);
  assert.match(source, /data\.workflow_dispatches/);
  assert.match(source, /data\.work_cycles/);
  assert.match(source, /data\.execution_evidence/);
  assert.match(source, /exec-diff-/);
  assert.match(source, /exec-test-/);
  assert.match(source, /document\.createElement\('details'\)/);
  assert.match(source, /melCodeSafeDetail\(event\.detail\)/);
  assert.match(source, /melCodeActivitySeen\.has\(event\.id\)/);
  assert.match(source, /melCodeActivityPolling/);
  assert.match(source, /\[MASQUÉ\]/);
});

test('activity API exposes recorded structured executor evidence without file contents', async () => {
  const source=await readFile(new URL('../src/evolution/autonomy-activity.js', import.meta.url), 'utf8');
  assert.match(source, /function executionEvidence\(job\)/);
  assert.match(source, /execution_evidence:/);
  assert.match(source, /safeExecutionText\(row.stdout, 3000\)/);
  assert.doesNotMatch(source, /content:\s*file\.content/);
});

test('Code activity follows the last visible entry and collapse hides the full plan', async () => {
  const source = await readFile(new URL('../src/pages/full-interface-v2.js', import.meta.url), 'utf8');
  assert.match(source, /new MutationObserver\(scrollToLatest\)\.observe\(panel/);
  assert.match(source, /panel\.scrollTop=panel\.scrollHeight/);
  assert.match(source, /is-collapsed #melCodePlan/);
  assert.match(source, /aria-expanded/);
});
