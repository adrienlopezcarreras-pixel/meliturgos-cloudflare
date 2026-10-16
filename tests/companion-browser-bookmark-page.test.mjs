import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { COMPUTER_USE_ACTIONS, evaluateComputerUsePlan, createComputerUseController } from '../src/devices/computer-use.js';

const step = { id: 'bookmark', action: COMPUTER_USE_ACTIONS.BROWSER_BOOKMARK_PAGE, window_handle: '45678' };
const base = {
  session_id: 'owner-bookmark-tab',
  device: { id: 'companion-windows', capabilities: ['computer.use'] },
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

test('bookmark page requires consent to this action on an inspected HWND', () => {
  assert.equal(verdict(step, false).reason, 'EXPLICIT_STEP_APPROVAL_REQUIRED');
  const approved = verdict();
  assert.equal(approved.allowed, true);
  assert.equal(approved.decisions[0].risk, 'SENSITIVE');
  for (const window_handle of ['', '0', '-1', ' 45678', '1e4', '9223372036854775808']) {
    assert.equal(verdict({ ...step, window_handle }).reason,
      'BROWSER_BOOKMARK_PAGE_WINDOW_HANDLE_REQUIRED', window_handle);
  }
});
test('bookmark shortcut refuses unknown URLs, destination folders or repeat requests', () => {
  for (const [field, value] of [
    ['url', 'https://example.com'], ['text', 'private'],
    ['folder', 'Other bookmarks'], ['title', 'A title'],
    ['repeat', 5], ['key', 'CTRL+D'], ['x', 30], ['y', 10],
    ['app', 'browser'], ['path', 'C:\\\\private'], ['unknown', null],
  ]) {
    const result = verdict({ ...step, [field]: value });
    assert.equal(result.allowed, false, field);
    assert.equal(result.reason, 'BROWSER_BOOKMARK_PAGE_UNEXPECTED_FIELD', field);
  }
});
test('invalid bookmark request fails the whole plan before native execution', async () => {
  const calls = [], audits = [];
  const controller = createComputerUseController({
    adapter: { perform: async item => calls.push(item.action) },
    authorize: async () => true,
    audit: async item => audits.push(item),
  });
  await assert.rejects(controller.execute({
    ...base, steps: [
      { id: 'inspect', action: COMPUTER_USE_ACTIONS.BROWSER_INSPECT },
      { ...step, window_handle: '0' },
    ],
  }), error => error.code === 'BROWSER_BOOKMARK_PAGE_WINDOW_HANDLE_REQUIRED');
  assert.deepEqual(calls, []);
  assert.equal(audits.at(-1).status, 'DENIED');
  assert.equal(audits.at(-1).completed_steps, 0);
});
test('native bookmark checks consented browser and reports only shortcut dispatch', async () => {
  const script = await readFile(new URL('../assets/MEL-Computer-Companion.ps1', import.meta.url), 'utf8');
  const dist = await readFile(new URL('../dist/MEL-Computer-Companion.ps1', import.meta.url), 'utf8');
  const api = await readFile(new URL('../src/devices/computer-companion-api.js', import.meta.url), 'utf8');
  assert.equal(script, dist);
  assert.ok(api.includes('"browser.bookmark-page"'));
  const start = script.indexOf('"browser.bookmark-page" {');
  const end = script.indexOf('"browser.reopen-tab" {', start);
  assert.ok(start > 0 && end > start);
  const handler = script.slice(start, end);
  for (const token of [
    'TryParse([string]$step.window_handle',
    '$window.ToInt64() -ne $expectedHandle',
    'BROWSER_BOOKMARK_PAGE_FOCUS_CHANGED',
    'Assert-ForegroundBrowser',
    'Assert-BrowserShortcutTarget $window $browser',
    'SendWait("^d")',
    'window_handle=$expectedHandle',
    'shortcut_sent=$true',
  ]) assert.ok(handler.includes(token), token);
  assert.ok(handler.lastIndexOf('Assert-BrowserShortcutTarget $window $browser') < handler.indexOf('SendWait("^d")'));
  assert.doesNotMatch(handler, /Get-Clipboard|Type-BrowserText|Start-Process|url=\$|text=\$/);
});
