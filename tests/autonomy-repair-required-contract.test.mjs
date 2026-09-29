import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('autonomy runtime retries REPAIR_REQUIRED executor failures without discarding approved package', async () => {
  const source = await readFile(new URL('../src/evolution/autonomy-runtime-core.js', import.meta.url), 'utf8');
  assert.match(source, /jobStatus === 'REPAIR_REQUIRED'/);
  assert.match(source, /executorFailure = jobStatus === 'REPAIR_REQUIRED' && failedTests\.length === 0/);
  assert.match(source, /OWNER_MAX_EXECUTOR_FAILURE/);
  assert.match(source, /runtime_retry/);
  assert.match(source, /status: 'TEACHER_APPROVED'/);
  assert.match(source, /if \(!executorFailure\) \{[\s\S]*delete result\.implementation_proposal;[\s\S]*delete result\.bridge_package;[\s\S]*delete result\.bridge_preparation;/);
});
