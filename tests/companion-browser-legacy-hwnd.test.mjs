import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { COMPUTER_USE_ACTIONS, evaluateComputerUsePlan, createComputerUseController } from '../src/devices/computer-use.js';

const legacy = [
  COMPUTER_USE_ACTIONS.BROWSER_CLOSE_TAB,
  COMPUTER_USE_ACTIONS.BROWSER_NEW_TAB,
  COMPUTER_USE_ACTIONS.BROWSER_BACK,
  COMPUTER_USE_ACTIONS.BROWSER_FORWARD,
  COMPUTER_USE_ACTIONS.BROWSER_RELOAD,
];
const base = {
  session_id: 'legacy-shortcuts',
  device: { id: 'windows-companion', capabilities: ['computer.use'] },
  sandbox: { allowed_apps: [], allowed_origins: [], allowed_paths: [] },
};
const step = action => ({ id: 'shortcut', action, window_handle: '123456' });
function check(item, approved = true) {
  return evaluateComputerUsePlan({
    ...base, steps: [item],
    approvals: approved ? [{ approved: true, session_id: base.session_id,
      step_id: item.id, action: item.action }] : [],
  });
}

test('all five legacy shortcuts require explicit owner consent and exact HWND', () => {
  for (const action of legacy) {
    const current = step(action);
    assert.equal(check(current, false).reason, 'EXPLICIT_STEP_APPROVAL_REQUIRED');
    assert.equal(check(current).allowed, true);
    assert.equal(check(current).decisions[0].risk, 'SENSITIVE');
    for (const handle of ['', '0', '-1', ' 123456', '1e4', '9223372036854775808']) {
      assert.equal(check({ ...current, window_handle: handle }).reason,
        'BROWSER_SHORTCUT_WINDOW_HANDLE_REQUIRED', action + ' ' + handle);
    }
  }
});

test('legacy shortcuts reject extra targets rather than silently discarding user intent', () => {
  for (const action of legacy) {
    for (const [field, value] of [
      ['url', 'https://example.com'], ['text', 'another tab'],
      ['key', 'ENTER'], ['x', 100], ['y', 200], ['app', 'browser'],
      ['path', 'C:\\\\test'], ['repeat', 2], ['target', 'other-window'],
      ['unknown', null],
    ]) {
      const result = check({ ...step(action), [field]: value });
      assert.equal(result.allowed, false, action + ' ' + field);
      assert.equal(result.reason, 'BROWSER_SHORTCUT_UNEXPECTED_FIELD', action + ' ' + field);
    }
  }
});

test('one invalid old shortcut blocks all earlier steps before local dispatch', async () => {
  const performed = [], audits = [];
  const controller = createComputerUseController({
    adapter: { perform: async item => performed.push(item.action) },
    authorize: async () => true,
    audit: async item => audits.push(item),
  });
  await assert.rejects(controller.execute({
    ...base, steps: [
      { id: 'inspect', action: COMPUTER_USE_ACTIONS.BROWSER_INSPECT },
      { id: 'bad', action: COMPUTER_USE_ACTIONS.BROWSER_RELOAD, window_handle: '0' },
    ],
  }), error => error.code === 'BROWSER_SHORTCUT_WINDOW_HANDLE_REQUIRED');
  assert.deepEqual(performed, []);
  assert.equal(audits.at(-1).status, 'DENIED');
  assert.equal(audits.at(-1).completed_steps, 0);
});

test('native shortcuts require the very same browser HWND before each key injection', async () => {
  const source = await readFile(new URL('../assets/MEL-Computer-Companion.ps1', import.meta.url), 'utf8');
  const dist = await readFile(new URL('../dist/MEL-Computer-Companion.ps1', import.meta.url), 'utf8');
  assert.equal(source, dist);
  for (const [action, next, key] of [
    ['browser.close-tab', 'browser.new-tab', 'SendWait("^w")'],
    ['browser.new-tab', 'browser.back', 'SendWait("^t")'],
    ['browser.back', 'browser.forward', 'SendWait("%{LEFT}")'],
    ['browser.forward', 'browser.reload', 'SendWait("%{RIGHT}")'],
    ['browser.reload', 'browser.click', 'SendWait("{F5}")'],
  ]) {
    const a = source.indexOf(`"${action}" {`);
    const b = source.indexOf(`"${next}" {`, a);
    assert.ok(a > 0 && b > a, action);
    const body = source.slice(a, b);
    for (const token of [
      'TryParse([string]$step.window_handle',
      '$window.ToInt64() -ne $expectedHandle',
      'BROWSER_SHORTCUT_FOCUS_CHANGED',
      'Assert-ForegroundBrowser',
      'Assert-BrowserShortcutTarget $window $browser',
      'window_handle=$expectedHandle',
    ]) assert.ok(body.includes(token), action + ' ' + token);
    const send = body.indexOf(key);
    assert.ok(send > 0, action);
    assert.ok(body.lastIndexOf('Assert-BrowserShortcutTarget $window $browser') < send);
  }
});
