import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { COMPUTER_USE_ACTIONS, evaluateComputerUsePlan, createComputerUseController } from '../src/devices/computer-use.js';

const actions = [
  COMPUTER_USE_ACTIONS.BROWSER_ZOOM_IN,
  COMPUTER_USE_ACTIONS.BROWSER_ZOOM_OUT,
  COMPUTER_USE_ACTIONS.BROWSER_ZOOM_RESET,
];
const base = {
  session_id: 'zoom-owner-session',
  device: { id: 'companion-win', capabilities: ['computer.use'] },
  sandbox: { allowed_origins: [], allowed_paths: [], allowed_apps: [] },
};
const step = action => ({ id: 'zoom', action, window_handle: '45123' });
function verdict(item, approved = true) {
  return evaluateComputerUsePlan({
    ...base, steps: [item],
    approvals: approved ? [{ session_id: base.session_id, step_id: item.id,
      action: item.action, approved: true }] : [],
  });
}

test('each zoom action is sensitive and requires exact per-step owner approval', () => {
  for (const action of actions) {
    assert.equal(verdict(step(action), false).reason, 'EXPLICIT_STEP_APPROVAL_REQUIRED');
    const allowed = verdict(step(action));
    assert.equal(allowed.allowed, true);
    assert.equal(allowed.decisions[0].risk, 'SENSITIVE');
  }
});

test('zoom rejects missing, changed or imprecise browser window identity', () => {
  for (const action of actions) {
    for (const window_handle of ['', '0', '-1', ' 45123', '4e4', '9223372036854775808']) {
      assert.equal(verdict({ ...step(action), window_handle }).reason,
        'BROWSER_ZOOM_WINDOW_HANDLE_REQUIRED', action + ' ' + window_handle);
    }
  }
});

test('zoom refuses ignored percent, repeats, coordinate or target information', () => {
  for (const action of actions) {
    for (const [field, value] of [
      ['percent', 175], ['zoom_level', 1.25], ['repeat', 10],
      ['text', 'other target'], ['url', 'https://example.com'],
      ['key', 'CTRL+PLUS'], ['x', 50], ['y', 100],
      ['app', 'browser'], ['path', 'C:\\\\temp'], ['unknown', null],
    ]) {
      const result = verdict({ ...step(action), [field]: value });
      assert.equal(result.allowed, false, action + ' ' + field);
      assert.equal(result.reason, 'BROWSER_ZOOM_UNEXPECTED_FIELD', action + ' ' + field);
    }
  }
});

test('invalid zoom denies the whole plan before any native action', async () => {
  const calls = [], audits = [];
  const controller = createComputerUseController({
    adapter: { perform: async item => calls.push(item.action) },
    authorize: async () => true,
    audit: async row => audits.push(row),
  });
  await assert.rejects(controller.execute({
    ...base, steps: [
      { id: 'inspect', action: COMPUTER_USE_ACTIONS.BROWSER_INSPECT },
      { id: 'zoom', action: COMPUTER_USE_ACTIONS.BROWSER_ZOOM_RESET,
        window_handle: '0' },
    ],
  }), error => error.code === 'BROWSER_ZOOM_WINDOW_HANDLE_REQUIRED');
  assert.deepEqual(calls, []);
  assert.equal(audits.at(-1).status, 'DENIED');
  assert.equal(audits.at(-1).completed_steps, 0);
});

test('native zoom uses scoped foreground browser shortcuts with current local STOP checks', async () => {
  const script = await readFile(new URL('../assets/MEL-Computer-Companion.ps1', import.meta.url), 'utf8');
  const dist = await readFile(new URL('../dist/MEL-Computer-Companion.ps1', import.meta.url), 'utf8');
  const api = await readFile(new URL('../src/devices/computer-companion-api.js', import.meta.url), 'utf8');
  assert.equal(script, dist);
  assert.ok(api.includes('"browser.zoom-in","browser.zoom-out","browser.zoom-reset"'));
  assert.ok(script.includes('function Assert-BrowserShortcutTarget('));
  const handlers = [
    ['"browser.zoom-in" {', '"browser.zoom-out" {', 'SendWait("^{ADD}")'],
    ['"browser.zoom-out" {', '"browser.zoom-reset" {', 'SendWait("^{SUBTRACT}")'],
    ['"browser.zoom-reset" {', '"browser.navigate" {', 'SendWait("^0")'],
  ];
  for (const [start, end, shortcut] of handlers) {
    const startIndex = script.indexOf(start);
    const endIndex = script.indexOf(end, startIndex);
    assert.ok(startIndex > 0 && endIndex > startIndex, start);
    const body = script.slice(startIndex, endIndex);
    for (const token of [
      'TryParse([string]$step.window_handle',
      '$window.ToInt64() -ne $expectedHandle',
      'BROWSER_ZOOM_FOCUS_CHANGED',
      'Assert-ForegroundBrowser',
      'Assert-BrowserShortcutTarget $window $browser',
      'shortcut_sent=$true',
    ]) assert.ok(body.includes(token), start + ' ' + token);
    const index = body.indexOf(shortcut);
    assert.ok(index > 0, shortcut);
    assert.ok(body.lastIndexOf('Assert-BrowserShortcutTarget $window $browser') < index);
    assert.ok(!body.includes('Type-BrowserText'));
  }
});
