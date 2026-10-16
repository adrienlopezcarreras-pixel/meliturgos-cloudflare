import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { COMPUTER_USE_ACTIONS, evaluateComputerUsePlan, createComputerUseController } from '../src/devices/computer-use.js';

const step = { id: 'fullscreen', action: COMPUTER_USE_ACTIONS.BROWSER_TOGGLE_FULLSCREEN, window_handle: '41234' };
const base = {
  session_id: 'owner-fullscreen', device: { id: 'win-pc', capabilities: ['computer.use'] },
  sandbox: { allowed_origins: [], allowed_apps: [], allowed_paths: [] },
};
function verdict(item = step, approved = true) {
  return evaluateComputerUsePlan({
    ...base, steps: [item], approvals: approved ? [{
      approved: true, session_id: base.session_id, step_id: item.id, action: item.action,
    }] : [],
  });
}
test('browser fullscreen requires exact inspected window and explicit owner consent', () => {
  assert.equal(verdict(step, false).reason, 'EXPLICIT_STEP_APPROVAL_REQUIRED');
  assert.equal(verdict().allowed, true);
  assert.equal(verdict().decisions[0].risk, 'SENSITIVE');
  for (const window_handle of ['', '0', '-1', ' 41234', '4e4', '9223372036854775808']) {
    assert.equal(verdict({ ...step, window_handle }).reason,
      'BROWSER_FULLSCREEN_WINDOW_HANDLE_REQUIRED', window_handle);
  }
});
test('browser fullscreen rejects unsupported displays, repetitions and alternate targets', () => {
  for (const [field, value] of [
    ['mode', 'enable'], ['display', 2], ['state', 'off'], ['repeat', 3],
    ['url', 'https://example.com'], ['text', 'secret'], ['key', 'F11'],
    ['x', 35], ['y', 20], ['app', 'browser'], ['path', 'C:\\\\file'], ['unknown', null],
  ]) {
    const result = verdict({ ...step, [field]: value });
    assert.equal(result.allowed, false, field);
    assert.equal(result.reason, 'BROWSER_FULLSCREEN_UNEXPECTED_FIELD', field);
  }
});
test('invalid fullscreen request denies all preceding actions atomically', async () => {
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
  }), error => error.code === 'BROWSER_FULLSCREEN_WINDOW_HANDLE_REQUIRED');
  assert.deepEqual(performed, []);
  assert.equal(audits.at(-1).status, 'DENIED');
  assert.equal(audits.at(-1).completed_steps, 0);
});
test('native fullscreen sends only scoped F11 after local focus and STOP guards', async () => {
  const src = await readFile(new URL('../assets/MEL-Computer-Companion.ps1', import.meta.url), 'utf8');
  const dist = await readFile(new URL('../dist/MEL-Computer-Companion.ps1', import.meta.url), 'utf8');
  const api = await readFile(new URL('../src/devices/computer-companion-api.js', import.meta.url), 'utf8');
  assert.equal(src, dist);
  assert.ok(api.includes('"browser.toggle-fullscreen"'));
  const start = src.indexOf('"browser.toggle-fullscreen" {');
  const end = src.indexOf('"browser.bookmark-page" {', start);
  assert.ok(start > 0 && end > start);
  const handler = src.slice(start, end);
  for (const token of [
    'TryParse([string]$step.window_handle', '$window.ToInt64() -ne $expectedHandle',
    'BROWSER_FULLSCREEN_FOCUS_CHANGED', 'Assert-ForegroundBrowser',
    'Assert-BrowserShortcutTarget $window $browser',
    'SendWait("{F11}")', 'window_handle=$expectedHandle', 'shortcut_sent=$true',
  ]) assert.ok(handler.includes(token), token);
  assert.ok(handler.lastIndexOf('Assert-BrowserShortcutTarget $window $browser') < handler.indexOf('SendWait("{F11}")'));
  assert.doesNotMatch(handler, /Get-Clipboard|Type-BrowserText|Start-Process|url=\$|text=\$/);
});
