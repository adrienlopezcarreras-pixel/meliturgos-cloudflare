import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { COMPUTER_USE_ACTIONS, evaluateComputerUsePlan, createComputerUseController } from '../src/devices/computer-use.js';

const press = { id: 'press', action: COMPUTER_USE_ACTIONS.BROWSER_PRESS, key: 'ENTER', window_handle: '123456' };
const base = {
  session_id: 'browser-keys', device: { id: 'pc', capabilities: ['computer.use'] },
  sandbox: { allowed_apps: [], allowed_origins: [], allowed_paths: [] },
};
function verdict(step, approved = true) {
  return evaluateComputerUsePlan({
    ...base, steps: [step],
    approvals: approved ? [{ approved: true, session_id: base.session_id, step_id: step.id, action: step.action }] : [],
  });
}

test('browser.press requires exact owner approval and inspected foreground HWND', () => {
  assert.equal(verdict(press, false).reason, 'EXPLICIT_STEP_APPROVAL_REQUIRED');
  assert.equal(verdict(press).allowed, true);
  assert.equal(verdict(press).decisions[0].risk, 'SENSITIVE');
  for (const window_handle of ['', '0', '-1', '1e5', ' 123456', '9223372036854775808']) {
    assert.equal(verdict({ ...press, window_handle }).reason, 'BROWSER_PRESS_WINDOW_HANDLE_REQUIRED', window_handle);
  }
});

test('browser.press accepts only bounded navigation keys, never arbitrary shortcuts', () => {
  for (const key of ['ENTER','RETURN','TAB','ESC','ESCAPE','BACKSPACE','DELETE','UP','DOWN','LEFT','RIGHT','HOME','END','PGUP','PGDN']) {
    assert.equal(verdict({ ...press, key }).allowed, true, key);
  }
  for (const key of ['', '^', '+', '%', '~', '{', 'ALT+TAB', 'CTRL+S', 'CTRL+L', 'F5', 'FOO']) {
    assert.equal(verdict({ ...press, key }).reason, 'BROWSER_PRESS_KEY_NOT_ALLOWED', key);
  }
});

test('invalid browser.press refuses entire plan before earlier adapter operations', async () => {
  const performed = [], audits = [];
  const controller = createComputerUseController({
    adapter: { perform: async step => performed.push(step.action) },
    authorize: async () => true,
    audit: async row => audits.push(row),
  });
  await assert.rejects(controller.execute({
    ...base, steps: [
      { id: 'inspect', action: COMPUTER_USE_ACTIONS.BROWSER_INSPECT },
      { ...press, key: 'ALT+TAB' },
    ],
  }), error => error.code === 'BROWSER_PRESS_KEY_NOT_ALLOWED');
  assert.deepEqual(performed, []);
  assert.equal(audits.at(-1).status, 'DENIED');
  assert.equal(audits.at(-1).completed_steps, 0);
});

test('Windows browser.press checks recognized unchanged browser and local stop before key injection', async () => {
  const source = await readFile(new URL('../assets/MEL-Computer-Companion.ps1', import.meta.url), 'utf8');
  const dist = await readFile(new URL('../dist/MEL-Computer-Companion.ps1', import.meta.url), 'utf8');
  const api = await readFile(new URL('../src/devices/computer-companion-api.js', import.meta.url), 'utf8');
  assert.equal(source, dist);
  assert.ok(api.includes('"browser.press"'), 'owner must explicitly approve the exact browser press step');
  const start = source.indexOf('"browser.press" {');
  const end = source.indexOf('"browser.find" {', start);
  assert.ok(start > 0 && end > start);
  const handler = source.slice(start, end);
  for (const token of [
    'TryParse([string]$step.window_handle', '$window.ToInt64() -ne $expectedHandle',
    'BROWSER_PRESS_KEY_NOT_ALLOWED', 'Assert-ForegroundBrowser',
    '$script:MelExitRequested', 'Assert-BrowserShortcutTarget $window $browser',
    'Key-Token $key', 'SendWait($token)', 'window_handle=$expectedHandle',
  ]) assert.ok(handler.includes(token), token);
  const keyIndex = handler.indexOf('SendWait($token)');
  assert.ok(handler.lastIndexOf('Assert-BrowserShortcutTarget $window $browser') < keyIndex);
  assert.ok(handler.indexOf('Key-Token $key') < keyIndex);
  assert.ok(source.includes('function Assert-BrowserShortcutTarget('));
});
