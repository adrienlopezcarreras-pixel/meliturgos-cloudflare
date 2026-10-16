import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { COMPUTER_USE_ACTIONS, evaluateComputerUsePlan, createComputerUseController } from '../src/devices/computer-use.js';

const basic = {
  session_id: 'scroll-session',
  device: { id: 'windows-pc', capabilities: ['computer.use'] },
  sandbox: { allowed_apps: [], allowed_origins: [], allowed_paths: [] },
};
const scroll = {
  id: 'scroll', action: COMPUTER_USE_ACTIONS.BROWSER_SCROLL,
  window_handle: '123456', x: 200, y: 300, delta_y: -120,
};
function verdict(step, approved = true) {
  return evaluateComputerUsePlan({
    ...basic, steps: [step],
    approvals: approved ? [{
      session_id: basic.session_id, step_id: step.id, action: step.action, approved: true,
    }] : [],
  });
}

test('browser.scroll needs exact owner approval and a live window handle', () => {
  assert.equal(verdict(scroll, false).reason, 'EXPLICIT_STEP_APPROVAL_REQUIRED');
  assert.equal(verdict(scroll).allowed, true);
  assert.equal(verdict(scroll).decisions[0].risk, 'SENSITIVE');
  for (const handle of ['', '0', ' 123456', '1e5', '9223372036854775808', '-1']) {
    assert.equal(verdict({ ...scroll, window_handle: handle }).reason, 'BROWSER_SCROLL_WINDOW_HANDLE_REQUIRED', handle);
  }
});

test('browser.scroll rejects missing or unsafe coordinates and oversized wheel deltas', () => {
  const coordinates = [
    { x: undefined, y: 1 }, { x: 1, y: undefined },
    { x: null, y: 1 }, { x: 1.5, y: 1 }, { x: 'oops', y: 1 },
    { x: 2147483648, y: 1 }, { x: 1, y: -2147483649 },
  ];
  for (const bad of coordinates) {
    assert.equal(verdict({ ...scroll, ...bad }).reason, 'BROWSER_SCROLL_COORDINATES_INVALID');
  }
  for (const delta_y of [undefined, null, 'oops', 0, 1441, -1441, 1.5]) {
    assert.equal(verdict({ ...scroll, delta_y }).reason, 'BROWSER_SCROLL_DELTA_INVALID');
  }
  assert.equal(verdict({ ...scroll, x: -400, y: -100, delta_y: 1440 }).allowed, true);
});

test('invalid browser.scroll blocks all earlier plan steps before adapter dispatch', async () => {
  const steps = [{ id: 'observe', action: COMPUTER_USE_ACTIONS.BROWSER_INSPECT },
    { ...scroll, window_handle: '0' }];
  const performed = [];
  const audits = [];
  const controller = createComputerUseController({
    adapter: { perform: async step => performed.push(step.action) },
    authorize: async () => true,
    audit: async event => audits.push(event),
  });
  await assert.rejects(controller.execute({ ...basic, steps }), error =>
    error.code === 'BROWSER_SCROLL_WINDOW_HANDLE_REQUIRED');
  assert.deepEqual(performed, []);
  assert.equal(audits.at(-1).status, 'DENIED');
  assert.equal(audits.at(-1).completed_steps, 0);
});

test('Windows browser.scroll verifies visible bounds and foreground before wheel', async () => {
  const source = await readFile(new URL('../assets/MEL-Computer-Companion.ps1', import.meta.url), 'utf8');
  const packaged = await readFile(new URL('../dist/MEL-Computer-Companion.ps1', import.meta.url), 'utf8');
  const api = await readFile(new URL('../src/devices/computer-companion-api.js', import.meta.url), 'utf8');
  assert.equal(source, packaged);
  assert.ok(api.includes('"browser.click","browser.scroll","browser.type"'), 'owner approval routing');
  const begin = source.indexOf('"browser.scroll" {');
  const end = source.indexOf('"browser.type" {', begin);
  assert.ok(begin > 0 && end > begin);
  const handler = source.slice(begin, end);
  assert.ok(handler.includes('TryParse([string]$step.window_handle'));
  assert.ok(handler.includes('$window.ToInt64() -ne $expectedHandle'));
  assert.ok(handler.includes('Assert-ForegroundBrowser'));
  assert.ok(handler.includes('Assert-BrowserClickTarget $window $browser $x $y'));
  assert.ok(handler.includes('SetCursorPos($x, $y)'));
  assert.ok(handler.includes('GetCursorPos([ref]$point)'));
  assert.ok(handler.includes('BROWSER_SCROLL_DELTA_INVALID'));
  assert.ok(handler.indexOf('GetCursorPos([ref]$point)') < handler.indexOf('mouse_event($MOUSE_WHEEL'));
  assert.ok(handler.lastIndexOf('Assert-BrowserClickTarget') < handler.indexOf('mouse_event($MOUSE_WHEEL'));
  const checker = source.slice(source.indexOf('function Assert-BrowserClickTarget('), source.indexOf('function Type-BrowserText('));
  assert.ok(checker.includes('GetWindowRect'));
  assert.ok(checker.includes('SystemInformation]::VirtualScreen'));
  assert.ok(checker.includes('BROWSER_CLICK_OUTSIDE_WINDOW'));
});
