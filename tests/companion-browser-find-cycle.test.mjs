import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { COMPUTER_USE_ACTIONS, evaluateComputerUsePlan, createComputerUseController } from '../src/devices/computer-use.js';

const base = {
  session_id: 'browser-search-session',
  device: { id: 'companion', capabilities: ['computer.use'] },
  sandbox: { allowed_apps: [], allowed_paths: [], allowed_origins: [] },
};
const actions = [
  COMPUTER_USE_ACTIONS.BROWSER_FIND_NEXT,
  COMPUTER_USE_ACTIONS.BROWSER_FIND_PREVIOUS,
];
function verdict(step, approved = true) {
  return evaluateComputerUsePlan({
    ...base, steps: [step],
    approvals: approved ? [{ session_id: base.session_id, step_id: step.id, action: step.action, approved: true }] : [],
  });
}
test('find next/previous are sensitive and require exact HWND plus owner approval', () => {
  for (const action of actions) {
    const step = { id: 'cycle', action, window_handle: '34567' };
    assert.equal(verdict(step, false).reason, 'EXPLICIT_STEP_APPROVAL_REQUIRED');
    assert.equal(verdict(step).allowed, true);
    assert.equal(verdict(step).decisions[0].risk, 'SENSITIVE');
    for (const handle of ['', '0', '-1', ' 34567', '1e4', '9223372036854775808']) {
      assert.equal(verdict({ ...step, window_handle: handle }).reason, 'BROWSER_FIND_CYCLE_WINDOW_HANDLE_REQUIRED', handle);
    }
  }
});
test('invalid find cycle refuses all plan steps before touching adapter', async () => {
  const touched = [];
  const audits = [];
  const controller = createComputerUseController({
    adapter: { perform: async step => touched.push(step.action) },
    authorize: async () => true,
    audit: async record => audits.push(record),
  });
  await assert.rejects(controller.execute({
    ...base,
    steps: [
      { id: 'inspect', action: COMPUTER_USE_ACTIONS.BROWSER_INSPECT },
      { id: 'bad', action: COMPUTER_USE_ACTIONS.BROWSER_FIND_PREVIOUS, window_handle: '0' },
    ],
  }), error => error.code === 'BROWSER_FIND_CYCLE_WINDOW_HANDLE_REQUIRED');
  assert.deepEqual(touched, []);
  assert.equal(audits.at(-1).status, 'DENIED');
  assert.equal(audits.at(-1).completed_steps, 0);
});
test('Windows find cycles verify unchanged browser HWND, STOP and local consent before F3', async () => {
  const script = await readFile(new URL('../assets/MEL-Computer-Companion.ps1', import.meta.url), 'utf8');
  const dist = await readFile(new URL('../dist/MEL-Computer-Companion.ps1', import.meta.url), 'utf8');
  const api = await readFile(new URL('../src/devices/computer-companion-api.js', import.meta.url), 'utf8');
  assert.equal(script, dist);
  assert.ok(api.includes('"browser.find-next","browser.find-previous"'));
  const guard = script.slice(script.indexOf('function Assert-BrowserShortcutTarget('), script.indexOf('function Assert-BrowserClickTarget('));
  assert.match(guard, /Assert-LocalRemoteAccess/);
  assert.match(guard, /BROWSER_SHORTCUT_LOCAL_STOP_ACTIVE/);
  const expected = [
    ['"browser.find-next" {', '"browser.find-previous" {', 'SendWait("{F3}")'],
    ['"browser.find-previous" {', '"browser.capture" {', 'SendWait("+{F3}")'],
  ];
  for (const [start, end, token] of expected) {
    const a = script.indexOf(start);
    const b = script.indexOf(end, a);
    assert.ok(a > 0 && b > a, start);
    const handler = script.slice(a, b);
    for (const item of ['TryParse([string]$step.window_handle', '$window.ToInt64() -ne $expectedHandle',
      'Assert-ForegroundBrowser', 'Assert-BrowserShortcutTarget $window $browser']) {
      assert.ok(handler.includes(item), item);
    }
    const sent = handler.indexOf(token);
    assert.ok(sent > 0, token);
    assert.ok(handler.lastIndexOf('Assert-BrowserShortcutTarget $window $browser') < sent);
    assert.ok(!handler.includes('Type-BrowserText'));
    assert.ok(!handler.includes('query_exposed='));
  }
});
