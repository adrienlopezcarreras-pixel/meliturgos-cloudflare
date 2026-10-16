import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { COMPUTER_USE_ACTIONS, evaluateComputerUsePlan, createComputerUseController } from '../src/devices/computer-use.js';

const action = COMPUTER_USE_ACTIONS.BROWSER_FOCUS_ADDRESS;
const step = { id: 'focus-url', action, window_handle: '123456' };
const base = {
  session_id: 'browser-address-focus',
  device: { id: 'windows-pc', capabilities: ['computer.use'] },
  sandbox: { allowed_apps: [], allowed_paths: [], allowed_origins: [] },
};
function verdict(item = step, approved = true) {
  return evaluateComputerUsePlan({
    ...base, steps: [item],
    approvals: approved ? [{
      session_id: base.session_id, step_id: item.id, action: item.action, approved: true,
    }] : [],
  });
}

test('browser.focus-address requires step-specific approval and inspected HWND', () => {
  assert.equal(verdict(step, false).reason, 'EXPLICIT_STEP_APPROVAL_REQUIRED');
  assert.equal(verdict().allowed, true);
  assert.equal(verdict().decisions[0].risk, 'SENSITIVE');
  for (const window_handle of ['', '0', '-1', ' 123456', '1e4', '9223372036854775808']) {
    assert.equal(verdict({ ...step, window_handle }).reason,
      'BROWSER_FOCUS_ADDRESS_WINDOW_HANDLE_REQUIRED', window_handle);
  }
});

test('focusing an address bar cannot silently enter or navigate to any URL', () => {
  for (const [field, value] of [
    ['url', 'https://example.com'], ['text', 'secret'], ['key', 'ENTER'],
    ['x', 30], ['y', 40], ['app', 'browser'], ['path', 'C:\\\\private'],
    ['navigate', true], ['selector', '#url'], ['repeat', 2], ['unknown', null],
  ]) {
    const result = verdict({ ...step, [field]: value });
    assert.equal(result.allowed, false, field);
    assert.equal(result.reason, 'BROWSER_FOCUS_ADDRESS_UNEXPECTED_FIELD', field);
  }
});

test('invalid focus request prevents any earlier native commands running', async () => {
  const calls = [], audits = [];
  const controller = createComputerUseController({
    adapter: { perform: async item => calls.push(item.action) },
    authorize: async () => true,
    audit: async item => audits.push(item),
  });
  await assert.rejects(controller.execute({
    ...base,
    steps: [
      { id: 'inspect', action: COMPUTER_USE_ACTIONS.BROWSER_INSPECT },
      { ...step, window_handle: '0' },
    ],
  }), error => error.code === 'BROWSER_FOCUS_ADDRESS_WINDOW_HANDLE_REQUIRED');
  assert.deepEqual(calls, []);
  assert.equal(audits.at(-1).status, 'DENIED');
  assert.equal(audits.at(-1).completed_steps, 0);
});

test('Windows Ctrl+L dispatch checks live browser HWND and local STOP before injection', async () => {
  const source = await readFile(new URL('../assets/MEL-Computer-Companion.ps1', import.meta.url), 'utf8');
  const dist = await readFile(new URL('../dist/MEL-Computer-Companion.ps1', import.meta.url), 'utf8');
  const api = await readFile(new URL('../src/devices/computer-companion-api.js', import.meta.url), 'utf8');
  assert.equal(source, dist);
  assert.ok(api.includes('"browser.focus-address"'), 'owner approval routing');
  assert.ok(source.includes('function Assert-BrowserShortcutTarget('));
  const start = source.indexOf('"browser.focus-address" {');
  const end = source.indexOf('"browser.open-downloads" {', start);
  assert.ok(start > 0 && end > start);
  const handler = source.slice(start, end);
  for (const token of [
    'TryParse([string]$step.window_handle',
    '$window.ToInt64() -ne $expectedHandle',
    'BROWSER_FOCUS_ADDRESS_FOCUS_CHANGED',
    'Assert-ForegroundBrowser',
    'Assert-BrowserShortcutTarget $window $browser',
    'SendWait("^l")',
    'window_handle=$expectedHandle',
    'shortcut_sent=$true',
  ]) assert.ok(handler.includes(token), token);
  assert.ok(handler.lastIndexOf('Assert-BrowserShortcutTarget $window $browser') < handler.indexOf('SendWait("^l")'));
  assert.ok(!handler.includes('Get-Clipboard'));
  assert.ok(!handler.includes('Type-BrowserText'));
  assert.ok(!handler.includes('Start-Process'));
});
