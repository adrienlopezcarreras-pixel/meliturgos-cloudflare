import test from 'node:test';
import assert from 'node:assert/strict';

import {
  COMPUTER_USE_ACTIONS,
  COMPUTER_USE_RISK,
  COMPUTER_USE_SCHEMA,
  classifyComputerUseAction,
  createComputerUseController,
  evaluateComputerUsePlan,
  normalizeComputerUseRequest,
} from '../../src/devices/computer-use.js';

const base = {
  session_id: 'session-1',
  device: { id: 'pc-1', capabilities: ['computer.use'] },
  sandbox: {
    allowed_apps: ['browser', 'notepad'],
    allowed_origins: ['https://example.com/path'],
    max_steps: 10,
  },
};

test('GEN2-30 classifies visual UI actions and rejects raw execution', () => {
  assert.equal(classifyComputerUseAction(COMPUTER_USE_ACTIONS.SCREENSHOT), COMPUTER_USE_RISK.OBSERVE);
  assert.equal(classifyComputerUseAction(COMPUTER_USE_ACTIONS.CLICK), COMPUTER_USE_RISK.INTERACT);
  assert.equal(classifyComputerUseAction(COMPUTER_USE_ACTIONS.TYPE_TEXT), COMPUTER_USE_RISK.SENSITIVE);
  assert.equal(classifyComputerUseAction('shell.exec'), COMPUTER_USE_RISK.DENY);
  assert.equal(classifyComputerUseAction('file.write'), COMPUTER_USE_RISK.DENY);
  assert.equal(classifyComputerUseAction('unknown.action'), COMPUTER_USE_RISK.DENY);
});

test('GEN2-30 fails closed without session, device capability or steps', () => {
  assert.equal(evaluateComputerUsePlan({}).reason, 'SESSION_AND_DEVICE_REQUIRED');
  assert.equal(evaluateComputerUsePlan({
    session_id: 's',
    device: { id: 'pc', capabilities: [] },
    steps: [{ action: COMPUTER_USE_ACTIONS.SCREENSHOT }],
  }).reason, 'COMPUTER_USE_CAPABILITY_REQUIRED');
  assert.equal(evaluateComputerUsePlan({ ...base, steps: [] }).reason, 'COMPUTER_USE_STEPS_REQUIRED');
});

test('GEN2-30 owner halt always denies the whole plan', () => {
  const plan = evaluateComputerUsePlan({
    ...base,
    owner_halt: true,
    steps: [{ id: 'shot', action: COMPUTER_USE_ACTIONS.SCREENSHOT }],
  });
  assert.equal(plan.allowed, false);
  assert.equal(plan.reason, 'OWNER_HALT_ACTIVE');
});

test('GEN2-30 permits low-risk visual interaction inside sandbox', () => {
  const plan = evaluateComputerUsePlan({
    ...base,
    steps: [
      { id: 'shot', action: COMPUTER_USE_ACTIONS.SCREENSHOT },
      { id: 'move', action: COMPUTER_USE_ACTIONS.CURSOR_MOVE, x: 50, y: 80 },
      { id: 'click', action: COMPUTER_USE_ACTIONS.CLICK, app: 'browser', url: 'https://example.com/account' },
    ],
  });
  assert.equal(plan.allowed, true);
  assert.equal(plan.reason, 'PLAN_AUTHORIZED');
  assert.equal(plan.decisions.length, 3);
  assert.ok(plan.decisions.every(row => row.allowed));
});

test('GEN2-30 enforces app and HTTPS-origin sandbox boundaries', () => {
  const badApp = evaluateComputerUsePlan({
    ...base,
    steps: [{ id: 'click', action: COMPUTER_USE_ACTIONS.CLICK, app: 'powershell' }],
  });
  assert.equal(badApp.allowed, false);
  assert.equal(badApp.reason, 'APP_OUTSIDE_SANDBOX');

  const badOrigin = evaluateComputerUsePlan({
    ...base,
    steps: [{ id: 'click', action: COMPUTER_USE_ACTIONS.CLICK, url: 'https://evil.example/' }],
  });
  assert.equal(badOrigin.allowed, false);
  assert.equal(badOrigin.reason, 'ORIGIN_OUTSIDE_SANDBOX');

  const httpOrigin = evaluateComputerUsePlan({
    ...base,
    steps: [{ id: 'click', action: COMPUTER_USE_ACTIONS.CLICK, url: 'http://example.com/' }],
  });
  assert.equal(httpOrigin.allowed, false);
  assert.equal(httpOrigin.reason, 'ORIGIN_OUTSIDE_SANDBOX');
});

test('GEN2-30 sensitive actions require exact step-scoped approval', () => {
  const step = { id: 'type-1', action: COMPUTER_USE_ACTIONS.TYPE_TEXT, app: 'notepad', text: 'hello' };
  const blocked = evaluateComputerUsePlan({ ...base, steps: [step] });
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.reason, 'EXPLICIT_STEP_APPROVAL_REQUIRED');

  const wrong = evaluateComputerUsePlan({
    ...base,
    steps: [step],
    approvals: [{ approved: true, session_id: base.session_id, step_id: 'other', action: step.action }],
  });
  assert.equal(wrong.allowed, false);

  const allowed = evaluateComputerUsePlan({
    ...base,
    steps: [step],
    approvals: [{ approved: true, session_id: base.session_id, step_id: step.id, action: step.action }],
  });
  assert.equal(allowed.allowed, true);
});

test('GEN2-30 denies duplicate step ids to keep audit deterministic', () => {
  const plan = evaluateComputerUsePlan({
    ...base,
    steps: [
      { id: 'same', action: COMPUTER_USE_ACTIONS.SCREENSHOT },
      { id: 'same', action: COMPUTER_USE_ACTIONS.CLICK },
    ],
  });
  assert.equal(plan.allowed, false);
  assert.equal(plan.reason, 'DUPLICATE_STEP_ID');
});

test('GEN2-30 normalizes sandbox bounds and strips invalid origins', () => {
  const normalized = normalizeComputerUseRequest({
    session_id: '  session-x ',
    device: { id: ' pc-x ', capabilities: ['computer.use', 'computer.use'] },
    sandbox: {
      allowed_apps: [' browser ', 'browser'],
      allowed_origins: ['https://example.com/path', 'http://unsafe.example'],
      max_steps: 999,
    },
    steps: [{ action: COMPUTER_USE_ACTIONS.SCREENSHOT }],
  });
  assert.equal(normalized.schema, COMPUTER_USE_SCHEMA);
  assert.equal(normalized.session_id, 'session-x');
  assert.deepEqual(normalized.device.capabilities, ['computer.use']);
  assert.deepEqual(normalized.sandbox.allowed_apps, ['browser']);
  assert.deepEqual(normalized.sandbox.allowed_origins, ['https://example.com']);
  assert.equal(normalized.sandbox.max_steps, 100);
});

test('GEN2-30 controller is fail-closed globally, executes sequentially and audits', async () => {
  const performed = [];
  const audits = [];
  const controller = createComputerUseController({
    adapter: {
      async perform(step) {
        performed.push(step.id);
        return { seen: step.action };
      },
    },
    authorize: async permission => permission === 'computer:use',
    audit: async row => audits.push(row),
  });

  const result = await controller.execute({
    ...base,
    steps: [
      { id: 'shot', action: COMPUTER_USE_ACTIONS.SCREENSHOT },
      { id: 'click', action: COMPUTER_USE_ACTIONS.CLICK, app: 'browser', url: 'https://example.com/' },
    ],
  });
  assert.equal(result.ok, true);
  assert.deepEqual(performed, ['shot', 'click']);
  assert.equal(result.steps_completed, 2);
  assert.equal(audits.at(-1).status, 'COMPLETED');
  assert.equal(audits.at(-1).completed_steps, 2);

  const deniedController = createComputerUseController({
    adapter: { perform: async () => assert.fail('adapter must not run') },
    authorize: async () => false,
    audit: async row => audits.push(row),
  });
  await assert.rejects(
    deniedController.execute({ ...base, steps: [{ action: COMPUTER_USE_ACTIONS.SCREENSHOT }] }),
    error => error.code === 'GLOBAL_PERMISSION_DENIED',
  );
  assert.equal(audits.at(-1).status, 'DENIED');
});
