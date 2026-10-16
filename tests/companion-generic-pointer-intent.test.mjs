import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { COMPUTER_USE_ACTIONS, evaluateComputerUsePlan, createComputerUseController } from '../src/devices/computer-use.js';

const base = {
  session_id: 'pointer-session',
  device: { id: 'windows', capabilities: ['computer.use'] },
  sandbox: { allowed_apps: [], allowed_paths: [], allowed_origins: [] },
};
const inspect = step => evaluateComputerUsePlan({ ...base, steps: [step] });

test('pointer.click accepts only its cursor-position left-click contract', () => {
  const step = { id: 'click', action: COMPUTER_USE_ACTIONS.CLICK };
  assert.equal(inspect(step).allowed, true);
  for (const [field, value] of [
    ['x', 50], ['y', 20], ['button', 'right'], ['click_count', 2],
    ['window_handle', '124'], ['key', 'ENTER'],
    ['target', 'save'], ['unknown', null],
  ]) {
    const decision = inspect({ ...step, [field]: value });
    assert.equal(decision.allowed, false, field);
    assert.equal(decision.reason, 'POINTER_CLICK_UNEXPECTED_FIELD', field);
  }
});

test('pointer.scroll only accepts nonzero vertical motion', () => {
  const step = { id: 'scroll', action: COMPUTER_USE_ACTIONS.SCROLL, delta_y: -120 };
  assert.equal(inspect(step).allowed, true);
  for (const [field, value] of [
    ['delta_x', 100], ['x', 20], ['y', 30], ['horizontal', true],
    ['window_handle', '124'], ['repeat', 3], ['unknown', null],
  ]) {
    const decision = inspect({ ...step, [field]: value });
    assert.equal(decision.allowed, false, field);
    assert.equal(decision.reason, 'POINTER_SCROLL_UNEXPECTED_FIELD', field);
  }
  assert.equal(inspect({ ...step, delta_y: 0 }).reason, 'SCROLL_DELTA_INVALID');
});

test('bad pointer intent denies the entire plan before earlier native actions', async () => {
  const touched = [];
  const controller = createComputerUseController({
    adapter: { perform: async step => touched.push(step.action) },
    authorize: async () => true,
  });
  await assert.rejects(controller.execute({
    ...base,
    steps: [
      { id: 'screenshot', action: COMPUTER_USE_ACTIONS.SCREENSHOT },
      { id: 'click', action: COMPUTER_USE_ACTIONS.CLICK, button: 'right' },
    ],
  }), error => error.code === 'POINTER_CLICK_UNEXPECTED_FIELD');
  assert.deepEqual(touched, []);
});

test('Windows native pointer implementation matches the strict left and vertical contracts', async () => {
  const source = await readFile(new URL('../assets/MEL-Computer-Companion.ps1', import.meta.url), 'utf8');
  const packaged = await readFile(new URL('../dist/MEL-Computer-Companion.ps1', import.meta.url), 'utf8');
  assert.equal(source, packaged);
  const click = source.slice(source.indexOf('"pointer.click" {'), source.indexOf('"pointer.scroll" {'));
  const scroll = source.slice(source.indexOf('"pointer.scroll" {'), source.indexOf('"keyboard.press" {'));
  assert.match(click, /\$MOUSE_LEFTDOWN/);
  assert.match(click, /\$MOUSE_LEFTUP/);
  assert.doesNotMatch(click, /\$step\.x|\$step\.y|MOUSE_RIGHTDOWN/);
  assert.match(scroll, /\$step\.delta_y/);
  assert.match(scroll, /\$MOUSE_WHEEL/);
  assert.doesNotMatch(scroll, /\$step\.delta_x/);
});
