import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { COMPUTER_USE_ACTIONS, evaluateComputerUsePlan, createComputerUseController } from '../src/devices/computer-use.js';

const search = { id: 'find', action: COMPUTER_USE_ACTIONS.BROWSER_FIND, window_handle: '123456', text: '  recette miel  ' };
const base = {
  session_id: 'find-session',
  device: { id: 'pc', capabilities: ['computer.use'] },
  sandbox: { allowed_apps: [], allowed_paths: [], allowed_origins: [] },
};
const evaluate = (step, approved = true) => evaluateComputerUsePlan({
  ...base, steps: [step],
  approvals: approved ? [{
    approved: true, session_id: base.session_id, step_id: step.id, action: step.action,
  }] : [],
});

test('browser.find requires exact HWND and owner approval while preserving search text', () => {
  assert.equal(evaluate(search, false).reason, 'EXPLICIT_STEP_APPROVAL_REQUIRED');
  const verdict = evaluate(search);
  assert.equal(verdict.allowed, true);
  assert.equal(verdict.decisions[0].risk, 'SENSITIVE');
  assert.equal(verdict.request.steps[0].text, '  recette miel  ');
  for (const handle of ['', '0', '-1', '1e5', ' 123456', '9223372036854775808']) {
    assert.equal(evaluate({ ...search, window_handle: handle }).reason, 'BROWSER_FIND_WINDOW_HANDLE_REQUIRED', handle);
  }
});

test('browser.find rejects unsafe, empty or oversized searches before executing anything', () => {
  for (const text of ['', ' ', '\n', 'mot\nligne', 'mot\u0000secret', 'a'.repeat(257), 'tab\tterm']) {
    assert.equal(evaluate({ ...search, text }).reason, 'BROWSER_FIND_TEXT_INVALID', JSON.stringify(text));
  }
  assert.equal(evaluate({ ...search, text: 'é'.repeat(256) }).allowed, true);
});

test('browser.find rejects unexpected fields rather than dropping requested targets', () => {
  for (const [field, value] of [
    ['url', 'https://example.com'], ['key', 'ENTER'], ['app', 'browser'],
    ['path', 'C:\\\\Users'], ['x', 15], ['y', 20], ['delta_y', 100],
    ['selector', 'input[name=q]'], ['target', 'second-window'], ['repeat', 2],
    ['text_hint', null],
  ]) {
    const verdict = evaluate({ ...search, [field]: value });
    assert.equal(verdict.allowed, false, field);
    assert.equal(verdict.reason, 'BROWSER_FIND_UNEXPECTED_FIELD', field);
  }
  assert.equal(evaluate(search).allowed, true);
});

test('invalid browser.find denies the whole plan without dispatching earlier actions', async () => {
  const calls = [], audits = [];
  const controller = createComputerUseController({
    adapter: { perform: async step => calls.push(step.id) },
    authorize: async () => true,
    audit: async entry => audits.push(entry),
  });
  await assert.rejects(controller.execute({
    ...base, steps: [
      { id: 'inspect', action: COMPUTER_USE_ACTIONS.BROWSER_INSPECT },
      { ...search, text: '\r' },
    ],
  }), error => error.code === 'BROWSER_FIND_TEXT_INVALID');
  assert.deepEqual(calls, []);
  assert.equal(audits.at(-1).status, 'DENIED');
  assert.equal(audits.at(-1).completed_steps, 0);
});

test('Windows browser.find validates HWND and never sends search content back to server', async () => {
  const asset = await readFile(new URL('../assets/MEL-Computer-Companion.ps1', import.meta.url), 'utf8');
  const dist = await readFile(new URL('../dist/MEL-Computer-Companion.ps1', import.meta.url), 'utf8');
  const api = await readFile(new URL('../src/devices/computer-companion-api.js', import.meta.url), 'utf8');
  assert.equal(asset, dist);
  assert.ok(api.includes('"browser.find"'));
  const begin = asset.indexOf('"browser.find" {');
  const end = asset.indexOf('"browser.next-tab" {', begin);
  assert.ok(begin > 0 && end > begin);
  const handler = asset.slice(begin, end);
  for (const item of [
    'TryParse([string]$step.window_handle', '$window.ToInt64() -ne $expectedHandle',
    'Assert-ForegroundBrowser', 'Assert-BrowserShortcutTarget $window $browser',
    'SendWait("^f")', 'Type-BrowserText $needle $window $browser',
    'BROWSER_FIND_TEXT_INVALID', 'query_exposed=$false',
  ]) assert.ok(handler.includes(item), item);
  assert.ok(handler.indexOf('SendWait("^f")') < handler.indexOf('Type-BrowserText'));
  assert.ok(handler.lastIndexOf('Assert-BrowserShortcutTarget') < handler.indexOf('Type-BrowserText'));
  assert.ok(!handler.includes('query=$needle'));
  assert.ok(!handler.includes('text=$needle'));
});
