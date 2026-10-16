import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { COMPUTER_USE_ACTIONS, evaluateComputerUsePlan, createComputerUseController } from '../src/devices/computer-use.js';

const actions = [COMPUTER_USE_ACTIONS.BROWSER_OPEN_DOWNLOADS, COMPUTER_USE_ACTIONS.BROWSER_OPEN_HISTORY];
const base = {
  session_id: 'browser-panel-session',
  device: { id: 'win-companion', capabilities: ['computer.use'] },
  sandbox: { allowed_apps: [], allowed_paths: [], allowed_origins: [] },
};
function verdict(step, approved = true) {
  return evaluateComputerUsePlan({
    ...base, steps: [step],
    approvals: approved ? [{
      session_id: base.session_id, step_id: step.id, action: step.action, approved: true,
    }] : [],
  });
}
const step = action => ({ id: 'panel', action, window_handle: '123456' });

test('browser history and downloads require step-specific owner approval and exact HWND', () => {
  for (const action of actions) {
    assert.equal(verdict(step(action), false).reason, 'EXPLICIT_STEP_APPROVAL_REQUIRED');
    const allowed = verdict(step(action));
    assert.equal(allowed.allowed, true);
    assert.equal(allowed.decisions[0].risk, 'SENSITIVE');
    for (const handle of ['', '0', '-1', ' 123456', '1e4', '9223372036854775808']) {
      assert.equal(verdict({ ...step(action), window_handle: handle }).reason,
        'BROWSER_PANEL_WINDOW_HANDLE_REQUIRED', action + ' ' + handle);
    }
  }
});

test('browser management panels refuse silent filtering, deletion or alternate targets', () => {
  for (const action of actions) {
    for (const [field, value] of [
      ['url', 'https://example.com'], ['text', 'secret'],
      ['delete', true], ['clear_history', true], ['download_file', 'x'],
      ['path', 'C:\\\\secret'], ['app', 'browser'], ['x', 22],
      ['y', 15], ['repeat', 3], ['unknown', null],
    ]) {
      const result = verdict({ ...step(action), [field]: value });
      assert.equal(result.allowed, false, action + ' ' + field);
      assert.equal(result.reason, 'BROWSER_PANEL_UNEXPECTED_FIELD', action + ' ' + field);
    }
  }
});

test('invalid browser panel access rejects full plan before native command dispatch', async () => {
  const calls = [], audits = [];
  const controller = createComputerUseController({
    adapter: { perform: async item => calls.push(item.action) },
    authorize: async () => true,
    audit: async row => audits.push(row),
  });
  await assert.rejects(controller.execute({
    ...base,
    steps: [
      { id: 'inspect', action: COMPUTER_USE_ACTIONS.BROWSER_INSPECT },
      { id: 'unsafe', action: COMPUTER_USE_ACTIONS.BROWSER_OPEN_HISTORY, window_handle: '0' },
    ],
  }), error => error.code === 'BROWSER_PANEL_WINDOW_HANDLE_REQUIRED');
  assert.deepEqual(calls, []);
  assert.equal(audits.at(-1).status, 'DENIED');
  assert.equal(audits.at(-1).completed_steps, 0);
});

test('Windows Ctrl+J and Ctrl+H target only approved browser window and do not read private data', async () => {
  const source = await readFile(new URL('../assets/MEL-Computer-Companion.ps1', import.meta.url), 'utf8');
  const dist = await readFile(new URL('../dist/MEL-Computer-Companion.ps1', import.meta.url), 'utf8');
  const api = await readFile(new URL('../src/devices/computer-companion-api.js', import.meta.url), 'utf8');
  assert.equal(source, dist);
  assert.ok(api.includes('"browser.open-downloads","browser.open-history"'));
  assert.ok(source.includes('function Assert-BrowserShortcutTarget('));
  for (const [start, end, shortcut] of [
    ['"browser.open-downloads" {', '"browser.open-history" {', 'SendWait("^j")'],
    ['"browser.open-history" {', '"browser.zoom-in" {', 'SendWait("^h")'],
  ]) {
    const a = source.indexOf(start), b = source.indexOf(end, a);
    assert.ok(a > 0 && b > a, start);
    const handler = source.slice(a, b);
    for (const token of [
      'TryParse([string]$step.window_handle', '$window.ToInt64() -ne $expectedHandle',
      'Assert-ForegroundBrowser', 'Assert-BrowserShortcutTarget $window $browser',
      'BROWSER_PANEL_FOCUS_CHANGED', 'shortcut_sent=$true',
    ]) assert.ok(handler.includes(token), start + ' ' + token);
    assert.ok(handler.includes(shortcut), shortcut);
    assert.ok(handler.lastIndexOf('Assert-BrowserShortcutTarget $window $browser') < handler.indexOf(shortcut));
    assert.ok(!handler.includes('Get-Clipboard'));
    assert.ok(!handler.includes('Type-BrowserText'));
  }
});
