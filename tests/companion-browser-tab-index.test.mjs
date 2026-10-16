import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { COMPUTER_USE_ACTIONS, evaluateComputerUsePlan, createComputerUseController } from '../src/devices/computer-use.js';

const base = {
  session_id: 'select-browser-tab',
  device: { id: 'windows-companion', capabilities: ['computer.use'] },
  sandbox: { allowed_apps: [], allowed_paths: [], allowed_origins: [] },
};
function check(step, approved = true) {
  return evaluateComputerUsePlan({
    ...base, steps: [step],
    approvals: approved ? [{ session_id: base.session_id, step_id: step.id, action: step.action, approved: true }] : [],
  });
}
const step = { id: 'select', action: COMPUTER_USE_ACTIONS.BROWSER_SELECT_TAB, window_handle: '34689', tab_index: 2 };

test('tab selection is explicitly approved and supports only numeric positions 1-9', () => {
  assert.equal(check(step, false).reason, 'EXPLICIT_STEP_APPROVAL_REQUIRED');
  for (const index of [1,2,3,4,5,6,7,8,9]) {
    const result = check({ ...step, tab_index: index });
    assert.equal(result.allowed, true, index);
    assert.equal(result.request.steps[0].tab_index, index);
    assert.equal(result.decisions[0].risk, 'SENSITIVE');
  }
  for (const index of [undefined, null, '', '1', 0, -1, 10, 1.5, Infinity, NaN]) {
    assert.equal(check({ ...step, tab_index: index }).reason, 'BROWSER_SELECT_TAB_INDEX_INVALID', String(index));
  }
});
test('numbered tab selection is bound to exact inspected HWND', () => {
  for (const handle of ['', '0', '-1', ' 34689', '1e4', '9223372036854775808']) {
    assert.equal(check({ ...step, window_handle: handle }).reason, 'BROWSER_SELECT_TAB_WINDOW_HANDLE_REQUIRED', handle);
  }
});
test('unsupported tab targets cannot be silently dropped', () => {
  for (const [field, value] of [
    ['text', 'secret'], ['url', 'https://example.com'], ['key', 'ENTER'],
    ['x', 100], ['y', 20], ['app', 'browser'], ['path', 'C:\\\\test'],
    ['selector', 'div.tab'], ['repeat', 10], ['unknown', null],
  ]) {
    const result = check({ ...step, [field]: value });
    assert.equal(result.allowed, false, field);
    assert.equal(result.reason, 'BROWSER_SELECT_TAB_UNEXPECTED_FIELD', field);
  }
});
test('invalid tab index blocks earlier steps before native execution', async () => {
  const performed = [], audits = [];
  const controller = createComputerUseController({
    adapter: { perform: async item => performed.push(item.action) },
    authorize: async () => true,
    audit: async record => audits.push(record),
  });
  await assert.rejects(controller.execute({
    ...base, steps: [
      { id: 'inspect', action: COMPUTER_USE_ACTIONS.BROWSER_INSPECT },
      { ...step, tab_index: 10 },
    ],
  }), error => error.code === 'BROWSER_SELECT_TAB_INDEX_INVALID');
  assert.deepEqual(performed, []);
  assert.equal(audits.at(-1).completed_steps, 0);
});
test('Windows numbered tab shortcut checks local STOP, focus and explicit owner approval', async () => {
  const script = await readFile(new URL('../assets/MEL-Computer-Companion.ps1', import.meta.url), 'utf8');
  const dist = await readFile(new URL('../dist/MEL-Computer-Companion.ps1', import.meta.url), 'utf8');
  const api = await readFile(new URL('../src/devices/computer-companion-api.js', import.meta.url), 'utf8');
  assert.equal(script, dist);
  assert.ok(api.includes('"browser.select-tab"'));
  const start = script.indexOf('"browser.select-tab" {');
  const end = script.indexOf('"browser.find-next" {', start);
  assert.ok(start > 0 && end > start);
  const handler = script.slice(start, end);
  for (const token of [
    'TryParse([string]$step.window_handle', '$window.ToInt64() -ne $expectedHandle',
    'TryParse([string]$step.tab_index', '$tabIndex -lt 1 -or $tabIndex -gt 9',
    'Assert-ForegroundBrowser', 'Assert-BrowserShortcutTarget $window $browser',
    'SendWait($shortcut)', '$shortcut = "^$tabIndex"',
  ]) assert.ok(handler.includes(token), token);
  assert.ok(handler.lastIndexOf('Assert-BrowserShortcutTarget $window $browser') < handler.indexOf('SendWait($shortcut)'));
  assert.match(handler, /tab_index=\$tabIndex/);
});
