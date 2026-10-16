import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { COMPUTER_USE_ACTIONS, evaluateComputerUsePlan, createComputerUseController } from '../src/devices/computer-use.js';

const type = { id: 'type', action: COMPUTER_USE_ACTIONS.BROWSER_TYPE, window_handle: '12345', text: 'Bonjour à tous' };
function verdict(step, approved = true) {
  return evaluateComputerUsePlan({
    session_id: 's', device: { id: 'pc', capabilities: ['computer.use'] },
    sandbox: { allowed_origins: [], allowed_paths: [], allowed_apps: [] },
    approvals: approved ? [{ session_id: 's', step_id: step.id, action: step.action, approved: true }] : [],
    steps: [step],
  });
}

test('browser.type requires a non-empty payload and exact approved browser handle', () => {
  assert.equal(verdict(type, false).reason, 'EXPLICIT_STEP_APPROVAL_REQUIRED');
  assert.equal(verdict(type).allowed, true);
  assert.equal(verdict(type).decisions[0].risk, 'SENSITIVE');
  assert.equal(verdict({ ...type, text: '' }).reason, 'BROWSER_TYPE_TEXT_REQUIRED');
  for (const handle of ['', '0', ' 12345', '-4', 'not-a-window', '9999999999999999999']) {
    assert.equal(verdict({ ...type, window_handle: handle }).reason, 'BROWSER_TYPE_WINDOW_HANDLE_REQUIRED', handle);
  }
  assert.equal(verdict({ ...type, text: 'x'.repeat(4097) }).reason, 'COMPUTER_USE_TEXT_LIMIT_EXCEEDED');
});

test('browser.type invalid request prevents prior approved actions from executing', async () => {
  const performed = [];
  const audits = [];
  const controller = createComputerUseController({
    adapter: { perform: async step => performed.push(step.id) },
    authorize: async () => true,
    audit: async row => audits.push(row),
  });
  await assert.rejects(
    controller.execute({
      session_id: 's', device: { id: 'pc', capabilities: ['computer.use'] },
      steps: [{ id: 'inspect', action: COMPUTER_USE_ACTIONS.BROWSER_INSPECT }, { ...type, window_handle: '0' }],
    }),
    error => error.code === 'BROWSER_TYPE_WINDOW_HANDLE_REQUIRED',
  );
  assert.deepEqual(performed, []);
  assert.equal(audits.at(-1).status, 'DENIED');
});

test('Windows browser typing checks focus, does not return private text, and restores clipboard', async () => {
  const asset = await readFile(new URL('../assets/MEL-Computer-Companion.ps1', import.meta.url), 'utf8');
  const dist = await readFile(new URL('../dist/MEL-Computer-Companion.ps1', import.meta.url), 'utf8');
  const api = await readFile(new URL('../src/devices/computer-companion-api.js', import.meta.url), 'utf8');
  assert.equal(asset, dist);
  assert.match(api, /"browser.type"/); // Approval is step-scoped, independent of neighboring actions
  const helper = asset.slice(asset.indexOf('function Type-BrowserText('), asset.indexOf('function Perform-Step('));
  assert.ok(helper.startsWith('function Type-BrowserText('));
  assert.match(helper, /GetDataObject/);
  assert.match(helper, /SetText\(\$text\)/);
  assert.match(helper, /Assert-BrowserShortcutTarget \$window \$browser/);
  assert.match(helper, /SendWait\("\^v"\)/);
  assert.match(helper, /finally \{[\s\S]*SetDataObject\(\$priorClipboard, \$true\)/);
  assert.ok(helper.lastIndexOf('Assert-BrowserShortcutTarget') < helper.indexOf('SendWait("^v")'));
  const block = asset.slice(asset.indexOf('"browser.type" {'), asset.indexOf('"browser.capture" {'));
  assert.match(block, /TryParse\(\[string\]\$step.window_handle/);
  assert.match(block, /\$window.ToInt64\(\) -ne \$expectedHandle/);
  assert.match(block, /Type-BrowserText \$text \$window \$browser/);
  assert.match(block, /text_exposed=\$false/);
  assert.doesNotMatch(block, /text=\$text/);
});
