import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { COMPUTER_USE_ACTIONS, evaluateComputerUsePlan, createComputerUseController } from '../src/devices/computer-use.js';

function plan(step, approved = false) {
  return evaluateComputerUsePlan({
    session_id: 'browser-session',
    device: { id: 'windows-pc', capabilities: ['computer.use'] },
    sandbox: { allowed_apps: [], allowed_origins: [], allowed_paths: [] },
    steps: [step],
    approvals: approved ? [{ session_id: 'browser-session', step_id: step.id, action: step.action, approved: true }] : [],
  });
}

const click = { id: 'click', action: COMPUTER_USE_ACTIONS.BROWSER_CLICK, x: 100, y: 120, window_handle: '45678' };

test('browser.click requires owner approval and exact inspected window identity', () => {
  assert.equal(plan(click).reason, 'EXPLICIT_STEP_APPROVAL_REQUIRED');
  const allowed = plan(click, true);
  assert.equal(allowed.allowed, true);
  assert.equal(allowed.decisions[0].risk, 'SENSITIVE');
  assert.equal(allowed.request.steps[0].window_handle, '45678');
  assert.equal(plan({ ...click, window_handle: 45678 }, true).allowed, true);
  for (const handle of ['', '0', '-1', '1e5', ' 45678', 'abc', '9'.repeat(19), '9'.repeat(20)]) {
    assert.equal(plan({ ...click, window_handle: handle }, true).reason, 'BROWSER_CLICK_WINDOW_HANDLE_REQUIRED', handle);
  }
});

test('browser.click rejects missing, fractional or out-of-range coordinates', () => {
  for (const coordinates of [{ x: 5, y: undefined }, { x: undefined, y: 5 }, { x: null, y: 5 }, { x: 'oops', y: 5 }, { x: 1.5, y: 5 }, { x: 2147483648, y: 5 }, { x: 5, y: -2147483649 }]) {
    assert.equal(plan({ ...click, ...coordinates }, true).reason, 'BROWSER_CLICK_COORDINATES_INVALID');
  }
  assert.equal(plan({ ...click, x: -100, y: 0 }, true).allowed, true, 'negative virtual-screen coordinates are valid');
});

test('browser.click denial prevents earlier steps from running', async () => {
  const performed = [];
  const audits = [];
  const controller = createComputerUseController({
    adapter: { perform: async step => performed.push(step.action) },
    authorize: async () => true,
    audit: async event => audits.push(event),
  });
  await assert.rejects(controller.execute({
    session_id: 's',
    device: { id: 'windows-pc', capabilities: ['computer.use'] },
    steps: [{ id: 'inspect', action: COMPUTER_USE_ACTIONS.BROWSER_INSPECT }, { ...click, window_handle: '' }],
  }), error => error.code === 'BROWSER_CLICK_WINDOW_HANDLE_REQUIRED');
  assert.deepEqual(performed, []);
  assert.equal(audits.at(-1).status, 'DENIED');
});

test('Windows browser click is constrained to the approved HWND and visible browser rectangle', async () => {
  const asset = await readFile(new URL('../assets/MEL-Computer-Companion.ps1', import.meta.url), 'utf8');
  const packaged = await readFile(new URL('../dist/MEL-Computer-Companion.ps1', import.meta.url), 'utf8');
  const api = await readFile(new URL('../src/devices/computer-companion-api.js', import.meta.url), 'utf8');
  assert.equal(asset, packaged);
  assert.match(api, /"browser.navigate","browser.capture","browser.click"/);
  const helper = asset.slice(asset.indexOf('function Assert-BrowserClickTarget('), asset.indexOf('function Perform-Step('));
  assert.match(helper, /Assert-LocalRemoteAccess/);
  assert.match(helper, /GetForegroundWindow\(\) -ne \$window/);
  assert.match(helper, /Assert-ForegroundBrowser/);
  assert.match(helper, /GetWindowRect/);
  assert.match(helper, /SystemInformation\]::VirtualScreen/);
  assert.match(helper, /BROWSER_CLICK_OUTSIDE_WINDOW/);
  const handler = asset.slice(asset.indexOf('"browser.click" {'), asset.indexOf('"browser.capture" {'));
  assert.match(handler, /TryParse\(\[string\]\$step.window_handle/);
  assert.match(handler, /\$window.ToInt64\(\) -ne \$expectedHandle/);
  assert.match(handler, /SetCursorPos\(\$x, \$y\)/);
  assert.match(handler, /GetCursorPos\(\[ref\]\$point\)/);
  assert.match(handler, /Assert-BrowserClickTarget \$window \$browser \$x \$y/);
  assert.ok(handler.indexOf('Assert-BrowserClickTarget') < handler.indexOf('$MOUSE_LEFTDOWN'));
  assert.match(handler, /finally \{[\s\S]*\$MOUSE_LEFTUP/);
});
