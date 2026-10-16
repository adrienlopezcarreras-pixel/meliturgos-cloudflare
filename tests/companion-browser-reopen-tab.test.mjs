import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { COMPUTER_USE_ACTIONS, evaluateComputerUsePlan, createComputerUseController } from '../src/devices/computer-use.js';

const step = { id: 'undo-close', action: COMPUTER_USE_ACTIONS.BROWSER_REOPEN_TAB, window_handle: '712345' };
const base = {
  session_id: 'restore-closed-browser-tab',
  device: { id: 'windows', capabilities: ['computer.use'] },
  sandbox: { allowed_apps: [], allowed_origins: [], allowed_paths: [] },
};
function check(item = step, approved = true) {
  return evaluateComputerUsePlan({
    ...base, steps: [item],
    approvals: approved ? [{
      approved: true, session_id: base.session_id, step_id: item.id, action: item.action,
    }] : [],
  });
}
test('reopen-tab always needs exact per-step owner approval', () => {
  assert.equal(check(step, false).reason, 'EXPLICIT_STEP_APPROVAL_REQUIRED');
  assert.equal(check().allowed, true);
  assert.equal(check().decisions[0].risk, 'SENSITIVE');
  for (const window_handle of ['', '0', '-1', ' 712345', '7e5', '9223372036854775808']) {
    assert.equal(check({ ...step, window_handle }).reason,
      'BROWSER_REOPEN_TAB_WINDOW_HANDLE_REQUIRED', window_handle);
  }
});
test('reopen-tab cannot silently restore arbitrary URL, specific older tab or repeat', () => {
  for (const [field, value] of [
    ['url', 'https://example.com'], ['text', 'private'], ['key', 'CTRL+SHIFT+T'],
    ['count', 3], ['repeat', 2], ['index', 1], ['target', 'private-tab'],
    ['x', 12], ['y', 25], ['app', 'browser'], ['path', 'C:\\\\data'],
    ['unknown', null],
  ]) {
    const v = check({ ...step, [field]: value });
    assert.equal(v.allowed, false, field);
    assert.equal(v.reason, 'BROWSER_REOPEN_TAB_UNEXPECTED_FIELD', field);
  }
});
test('invalid restore request rejects the whole plan before Windows dispatch', async () => {
  const performed = [], audits = [];
  const controller = createComputerUseController({
    adapter: { perform: async item => performed.push(item.action) },
    authorize: async () => true,
    audit: async item => audits.push(item),
  });
  await assert.rejects(controller.execute({
    ...base, steps: [
      { id: 'inspect', action: COMPUTER_USE_ACTIONS.BROWSER_INSPECT },
      { ...step, window_handle: '0' },
    ],
  }), error => error.code === 'BROWSER_REOPEN_TAB_WINDOW_HANDLE_REQUIRED');
  assert.deepEqual(performed, []);
  assert.equal(audits.at(-1).status, 'DENIED');
  assert.equal(audits.at(-1).completed_steps, 0);
});
test('Windows Ctrl+Shift+T checks foreground browser/STOP and returns no closed-tab contents', async () => {
  const src = await readFile(new URL('../assets/MEL-Computer-Companion.ps1', import.meta.url), 'utf8');
  const dist = await readFile(new URL('../dist/MEL-Computer-Companion.ps1', import.meta.url), 'utf8');
  const api = await readFile(new URL('../src/devices/computer-companion-api.js', import.meta.url), 'utf8');
  assert.equal(src, dist);
  assert.ok(api.includes('"browser.reopen-tab"'), 'explicit owner sensitive-action routing');
  const start = src.indexOf('"browser.reopen-tab" {');
  const end = src.indexOf('"browser.focus-address" {', start);
  assert.ok(start > 0 && end > start);
  const handler = src.slice(start, end);
  for(const token of [
    'TryParse([string]$step.window_handle', '$window.ToInt64() -ne $expectedHandle',
    'BROWSER_REOPEN_TAB_FOCUS_CHANGED', 'Assert-ForegroundBrowser',
    'Assert-BrowserShortcutTarget $window $browser', 'SendWait("^+t")',
    'window_handle=$expectedHandle', 'shortcut_sent=$true',
  ]) assert.ok(handler.includes(token), token);
  assert.ok(handler.lastIndexOf('Assert-BrowserShortcutTarget $window $browser') < handler.indexOf('SendWait("^+t")'));
  assert.doesNotMatch(handler, /Get-Clipboard|Type-BrowserText|Start-Process|url=\$|text=\$/);
});
