import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  COMPUTER_USE_ACTIONS, COMPUTER_USE_RISK,
  classifyComputerUseAction, evaluateComputerUsePlan, createComputerUseController,
} from '../src/devices/computer-use.js';

const base = {
  session_id: 'keyboard-consent-test',
  device: { id: 'windows', capabilities: ['computer.use'] },
  sandbox: { allowed_apps: [], allowed_paths: [], allowed_origins: [] },
};
const keyStep = key => ({ id: 'press', action: COMPUTER_USE_ACTIONS.KEY_PRESS, key });
function check(key, approvals = []) {
  return evaluateComputerUsePlan({ ...base, steps: [keyStep(key)], approvals });
}
const approved = [{
  approved: true, session_id: base.session_id,
  step_id: 'press', action: COMPUTER_USE_ACTIONS.KEY_PRESS,
}];

test('generic keyboard.press is sensitive and blocks unapproved ordinary or privileged keypresses', () => {
  assert.equal(classifyComputerUseAction(COMPUTER_USE_ACTIONS.KEY_PRESS), COMPUTER_USE_RISK.SENSITIVE);
  for (const key of ['ENTER', 'a', 'CTRL+V', 'CTRL+S', 'CTRL+C', 'ALT+TAB', 'F12']) {
    assert.equal(check(key).allowed, false, key);
    assert.equal(check(key).reason, 'EXPLICIT_STEP_APPROVAL_REQUIRED', key);
    assert.equal(check(key, approved).allowed, true, key);
    assert.equal(check(key, approved).decisions[0].risk, 'SENSITIVE');
  }
});
test('consent is scoped to the exact session, step and action', () => {
  for (const approval of [
    { ...approved[0], session_id: 'wrong' },
    { ...approved[0], step_id: 'other-step' },
    { ...approved[0], action: COMPUTER_USE_ACTIONS.TYPE_TEXT },
    { ...approved[0], approved: false },
  ]) {
    assert.equal(check('CTRL+V', [approval]).reason, 'EXPLICIT_STEP_APPROVAL_REQUIRED');
  }
});
test('unsupported Win32 SendKeys tokens remain denied even if owner approves the step', () => {
  for (const key of ['^', '{', 'ALT+F4', 'CTRL+ALT+DELETE', 'F13']) {
    assert.equal(check(key, approved).reason, 'KEY_NOT_SUPPORTED', key);
  }
});
test('unapproved shortcut blocks earlier valid steps before native dispatch', async () => {
  const performed = [], audits = [];
  const controller = createComputerUseController({
    adapter: { perform: async step => performed.push(step.action) },
    authorize: async () => true,
    audit: async row => audits.push(row),
  });
  await assert.rejects(controller.execute({
    ...base,
    steps: [
      { id: 'shot', action: COMPUTER_USE_ACTIONS.SCREENSHOT },
      { id: 'press', action: COMPUTER_USE_ACTIONS.KEY_PRESS, key: 'CTRL+V' },
    ],
  }), error => error.code === 'EXPLICIT_STEP_APPROVAL_REQUIRED');
  assert.deepEqual(performed, []);
  assert.equal(audits.at(-1).status, 'DENIED');
  assert.equal(audits.at(-1).completed_steps, 0);
});
test('owner API routes keyboard.press through per-step approvals and native emits approved safe Key-Token', async () => {
  const api = await readFile(new URL('../src/devices/computer-companion-api.js', import.meta.url), 'utf8');
  const native = await readFile(new URL('../assets/MEL-Computer-Companion.ps1', import.meta.url), 'utf8');
  const dist = await readFile(new URL('../dist/MEL-Computer-Companion.ps1', import.meta.url), 'utf8');
  assert.equal(native, dist);
  assert.ok(api.includes('new Set(["keyboard.press","keyboard.type"'));
  assert.ok(api.includes('step_id:String(x.id),action:String(x.action)'));
  const handler = native.slice(native.indexOf('"keyboard.press" {'), native.indexOf('"keyboard.type" {'));
  assert.ok(handler.includes('Key-Token ([string]$step.key)'));
  assert.ok(handler.includes('SendWait('));
  assert.ok(native.includes('"CTRL+V" { return "^v" }'));
  assert.ok(native.includes('"ALT+TAB" { return "%{TAB}" }'));
});
