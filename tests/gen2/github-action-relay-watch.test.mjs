import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('the relay keeps watching the queue and hands over, since GitHub schedules are sparse', async () => {
  const runner = await readFile(new URL('../../scripts/github-action-relay-runner.mjs', import.meta.url), 'utf8');
  const workflow = await readFile(new URL('../../.github/workflows/github-action-relay.yml', import.meta.url), 'utf8');
  assert.match(runner, /MEL_RELAY_WATCH_SECONDS/);
  assert.match(runner, /Math\.min\(3300,/, 'a watch must end before the 60 min job timeout');
  assert.match(runner, /async function freshOidc\(\)/, 'OIDC tokens expire within minutes and must be refreshed');
  assert.match(runner, /await freshOidc\(\);\n  const response = await fetch\(BASE_URL \+ path/);
  assert.match(runner, /dispatch\(\{ workflow: 'github-action-relay\.yml', ref: 'main', inputs: \{ target: 'production' \} \}\)/);
  assert.match(workflow, /timeout-minutes: 60/);
  assert.match(workflow, /MEL_RELAY_WATCH_SECONDS: .*'3000'.*'0'/);
  assert.match(workflow, /group: github-action-relay\n  cancel-in-progress: false/);
});
