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
  assert.match(source, /document\.createElement\('details'\)/);
  assert.match(source, /melCodeSafeDetail\(event\.detail\)/);
  assert.match(source, /melCodeActivitySeen\.has\(event\.id\)/);
  assert.match(source, /melCodeActivityPolling/);
  assert.match(source, /\[MASQUÉ\]/);
});
