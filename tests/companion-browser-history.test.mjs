import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { evaluateComputerUsePlan } from '../src/devices/computer-use.js';

function check(action, approved) {
  return evaluateComputerUsePlan({
    session_id: 's1', device: { id: 'paired', capabilities: ['computer.use'] },
    sandbox: { allowed_apps: [], allowed_origins: [], allowed_paths: [] },
    approvals: approved ? [{ session_id: 's1', step_id: 'history', action, approved: true }] : [],
    steps: [{ id: 'history', action }],
  });
}

for (const action of ['browser.back','browser.forward','browser.reload']) {
  test(action + ' requires exact owner-approved step', () => {
    assert.equal(check(action, false).allowed, false);
    assert.equal(check(action, false).reason, 'EXPLICIT_STEP_APPROVAL_REQUIRED');
    assert.equal(check(action, true).allowed, true);
  });
}

test('Windows browser history only targets a foreground recognized browser', async () => {
  const source = await readFile(new URL('../assets/MEL-Computer-Companion.ps1', import.meta.url), 'utf8');
  const dist = await readFile(new URL('../dist/MEL-Computer-Companion.ps1', import.meta.url), 'utf8');
  assert.equal(source, dist);
  assert.match(source, /function Assert-ForegroundBrowser/);
  assert.match(source, /GetWindowThreadProcessId/);
  assert.match(source, /BROWSER_FOREGROUND_REQUIRED/);
  assert.match(source, /"browser.back" \{/);
  assert.match(source, /"browser.forward" \{/);
  assert.match(source, /"browser.reload" \{/);
});
