import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { COMPUTER_USE_ACTIONS, evaluateComputerUsePlan, createComputerUseController } from '../src/devices/computer-use.js';

const actions = [COMPUTER_USE_ACTIONS.BROWSER_NEXT_TAB, COMPUTER_USE_ACTIONS.BROWSER_PREVIOUS_TAB];
const base = {
  session_id: 'tab-navigation-session',
  device: { id: 'companion-windows', capabilities: ['computer.use'] },
  sandbox: { allowed_apps: [], allowed_paths: [], allowed_origins: [] },
};
function verdict(step, approved = true) {
  return evaluateComputerUsePlan({
    ...base,
    steps: [step],
    approvals: approved ? [{
      session_id: base.session_id, step_id: step.id, action: step.action, approved: true,
    }] : [],
  });
}
test('next/previous tab require owner approval and the exact inspected window', () => {
  for (const action of actions) {
    const step = { id: 'tab-cycle', action, window_handle: '34567' };
    assert.equal(verdict(step, false).reason, 'EXPLICIT_STEP_APPROVAL_REQUIRED');
    assert.equal(verdict(step).allowed, true);
    assert.equal(verdict(step).decisions[0].risk, 'SENSITIVE');
    for (const handle of ['', '0', '-1', ' 34567', '1e4', '9223372036854775808']) {
      assert.equal(verdict({ ...step, window_handle: handle }).reason,
        'BROWSER_TAB_CYCLE_WINDOW_HANDLE_REQUIRED', handle);
    }
  }
});
test('tab cycling refuses any ignored extra payload rather than partially executing', () => {
  for (const action of actions) {
    for (const [field, value] of [
      ['text', 'secret'], ['url', 'https://example.com'],
      ['key', 'ALT+TAB'], ['app', 'browser'], ['path', 'C:\\\\temp'],
      ['x', 15], ['y', 50], ['repeat', 5], ['target', 'other-window'],
      ['unknown', null],
    ]) {
      const result = verdict({ id: 'tab-cycle', action, window_handle: '34567', [field]: value });
      assert.equal(result.allowed, false, action + ' ' + field);
      assert.equal(result.reason, 'BROWSER_TAB_CYCLE_UNEXPECTED_FIELD', action + ' ' + field);
    }
  }
});
test('unsafe tab cycling blocks all prior steps atomically', async () => {
  const performed = [], audits = [];
  const controller = createComputerUseController({
    adapter: { perform: async step => performed.push(step.action) },
    authorize: async () => true,
    audit: async record => audits.push(record),
  });
  await assert.rejects(controller.execute({
    ...base, steps: [
      { id: 'inspect', action: COMPUTER_USE_ACTIONS.BROWSER_INSPECT },
      { id: 'invalid', action: COMPUTER_USE_ACTIONS.BROWSER_NEXT_TAB, window_handle: '0' },
    ],
  }), error => error.code === 'BROWSER_TAB_CYCLE_WINDOW_HANDLE_REQUIRED');
  assert.deepEqual(performed, []);
  assert.equal(audits.at(-1).completed_steps, 0);
});
test('native Windows tab shortcuts check HWND and local permission before sending keys', async () => {
  const source = await readFile(new URL('../assets/MEL-Computer-Companion.ps1', import.meta.url), 'utf8');
  const dist = await readFile(new URL('../dist/MEL-Computer-Companion.ps1', import.meta.url), 'utf8');
  const api = await readFile(new URL('../src/devices/computer-companion-api.js', import.meta.url), 'utf8');
  assert.equal(source, dist);
  assert.ok(api.includes('"browser.next-tab","browser.previous-tab"'));
  const cases = [
    ['"browser.next-tab" {', '"browser.previous-tab" {', 'SendWait("^{TAB}")'],
    ['"browser.previous-tab" {', '"browser.find-next" {', 'SendWait("^+{TAB}")'],
  ];
  for (const [start, end, injection] of cases) {
    const left = source.indexOf(start);
    const right = source.indexOf(end, left);
    assert.ok(left > 0 && right > left, start);
    const code = source.slice(left, right);
    for (const token of [
      'TryParse([string]$step.window_handle', '$window.ToInt64() -ne $expectedHandle',
      'Assert-ForegroundBrowser', 'Assert-BrowserShortcutTarget $window $browser',
      'BROWSER_TAB_CYCLE_FOCUS_CHANGED',
    ]) assert.ok(code.includes(token), token);
    assert.ok(code.includes(injection), injection);
    assert.ok(code.lastIndexOf('Assert-BrowserShortcutTarget $window $browser') < code.indexOf(injection));
    assert.ok(!code.includes('Type-BrowserText'));
  }
});
