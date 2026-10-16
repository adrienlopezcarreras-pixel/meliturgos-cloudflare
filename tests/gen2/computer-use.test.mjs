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

test('GEN2-30 refuses partial execution if the submitted plan exceeds its step limit', () => {
  const ten = Array.from({ length: 10 }, (_, i) => ({ id: `step-${i}`, action: COMPUTER_USE_ACTIONS.SCREENSHOT }));
  const complete = evaluateComputerUsePlan({ ...base, steps: ten });
  assert.equal(complete.allowed, true);
  const oversized = evaluateComputerUsePlan({
    ...base,
    steps: [...ten, { id: 'extra', action: COMPUTER_USE_ACTIONS.SCREENSHOT }],
  });
  assert.equal(oversized.allowed, false);
  assert.equal(oversized.reason, 'COMPUTER_USE_STEP_LIMIT_EXCEEDED');
  assert.equal(oversized.decisions.length, 0);
});

test('GEN2-30 refuses typing when input text would be silently truncated', () => {
  const make = text => ({
    ...base,
    steps: [{ id: 'type', action: COMPUTER_USE_ACTIONS.TYPE_TEXT, app: 'notepad', text }],
    approvals: [{ session_id: base.session_id, step_id: 'type', action: COMPUTER_USE_ACTIONS.TYPE_TEXT, approved: true }],
  });
  assert.equal(evaluateComputerUsePlan(make('A'.repeat(4096))).allowed, true);
  const rejected = evaluateComputerUsePlan(make('A'.repeat(4097)));
  assert.equal(rejected.allowed, false);
  assert.equal(rejected.reason, 'COMPUTER_USE_TEXT_LIMIT_EXCEEDED');
});

test('GEN2-30 never executes a truncated plan or audits it as complete', async () => {
  const performed = [];
  const audits = [];
  const controller = createComputerUseController({
    adapter: { perform: async step => performed.push(step.id) },
    authorize: async () => true,
    audit: async entry => audits.push(entry),
  });
  await assert.rejects(
    controller.execute({
      ...base,
      sandbox: { ...base.sandbox, max_steps: 1 },
      steps: [
        { id: 'first', action: COMPUTER_USE_ACTIONS.SCREENSHOT },
        { id: 'second', action: COMPUTER_USE_ACTIONS.CLICK },
      ],
    }),
    error => error.code === 'COMPUTER_USE_STEP_LIMIT_EXCEEDED',
  );
  assert.deepEqual(performed, []);
  assert.equal(audits.at(-1).status, 'DENIED');
  assert.equal(audits.at(-1).reason, 'COMPUTER_USE_STEP_LIMIT_EXCEEDED');
});

test('GEN2-30 denies silently truncated remote PC step targets and key sequences', () => {
  const limits = [
    ['id', 'x'.repeat(201)],
    ['action', 'screen.capture' + 'x'.repeat(160)],
    ['app', 'browser' + 'x'.repeat(200)],
    ['path', 'C:\\\\safe\\\\' + 'a'.repeat(4100)],
    ['url', 'https://example.com/' + 'a'.repeat(2050)],
    ['key', 'ENTER' + 'x'.repeat(80)],
  ];
  for (const [field, value] of limits) {
    const step = { id: 'safe', action: COMPUTER_USE_ACTIONS.SCREENSHOT, [field]: value };
    const plan = evaluateComputerUsePlan({ ...base, steps: [step] });
    assert.equal(plan.allowed, false, field);
    assert.equal(plan.reason, 'COMPUTER_USE_STEP_FIELD_LIMIT_EXCEEDED', field);
    assert.equal(plan.decisions.length, 0, field);
  }
  assert.equal(evaluateComputerUsePlan({
    ...base,
    steps: [{ id: 'x'.repeat(200), action: COMPUTER_USE_ACTIONS.SCREENSHOT }],
  }).allowed, true, 'exact 200 character step ID remains permitted');
});

test('GEN2-30 refuses an oversized allowed-origin navigation URL before any adapter call', async () => {
  const performed = [];
  const audits = [];
  const controller = createComputerUseController({
    adapter: { perform: async step => performed.push(step) },
    authorize: async () => true,
    audit: async entry => audits.push(entry),
  });
  const step = {
    id: 'nav',
    action: COMPUTER_USE_ACTIONS.BROWSER_NAVIGATE,
    url: 'https://example.com/' + 'x'.repeat(2050),
  };
  await assert.rejects(
    controller.execute({
      ...base,
      steps: [step],
      approvals: [{ session_id: base.session_id, step_id: step.id, action: step.action, approved: true }],
    }),
    error => error.code === 'COMPUTER_USE_STEP_FIELD_LIMIT_EXCEEDED',
  );
  assert.deepEqual(performed, []);
  assert.equal(audits.at(-1).status, 'DENIED');
});


test('GEN2-30 rejects incomplete pointer and keyboard commands instead of making unintended Windows actions', () => {
  const malformed = [
    [{ id: 'cursor', action: COMPUTER_USE_ACTIONS.CURSOR_MOVE, x: 12 }, 'POINTER_COORDINATES_INVALID'],
    [{ id: 'cursor', action: COMPUTER_USE_ACTIONS.CURSOR_MOVE, x: null, y: 10 }, 'POINTER_COORDINATES_INVALID'],
    [{ id: 'cursor', action: COMPUTER_USE_ACTIONS.CURSOR_MOVE, x: 'NaN', y: 10 }, 'POINTER_COORDINATES_INVALID'],
    [{ id: 'cursor', action: COMPUTER_USE_ACTIONS.CURSOR_MOVE, x: 12.5, y: 10 }, 'POINTER_COORDINATES_INVALID'],
    [{ id: 'scroll', action: COMPUTER_USE_ACTIONS.SCROLL }, 'SCROLL_DELTA_INVALID'],
    [{ id: 'scroll', action: COMPUTER_USE_ACTIONS.SCROLL, delta_y: 'oops' }, 'SCROLL_DELTA_INVALID'],
    [{ id: 'scroll', action: COMPUTER_USE_ACTIONS.SCROLL, delta_y: 0 }, 'SCROLL_DELTA_INVALID'],
    [{ id: 'press', action: COMPUTER_USE_ACTIONS.KEY_PRESS }, 'KEY_REQUIRED'],
  ];
  for (const [step, expectedReason] of malformed) {
    const plan = evaluateComputerUsePlan({ ...base, steps: [step] });
    assert.equal(plan.allowed, false, step.id);
    assert.equal(plan.reason, expectedReason, step.id);
  }
  assert.equal(evaluateComputerUsePlan({
    ...base,
    steps: [
      { id: 'cursor', action: COMPUTER_USE_ACTIONS.CURSOR_MOVE, x: 0, y: -15 },
      { id: 'scroll', action: COMPUTER_USE_ACTIONS.SCROLL, delta_y: '-120' },
      { id: 'press', action: COMPUTER_USE_ACTIONS.KEY_PRESS, key: 'ENTER' },
    ],
  }).allowed, true);
});

test('GEN2-30 never performs an earlier approved PC command when a later scroll input is incomplete', async () => {
  const performed = [];
  const audits = [];
  const controller = createComputerUseController({
    adapter: { perform: async step => performed.push(step.id) },
    authorize: async () => true,
    audit: async entry => audits.push(entry),
  });
  await assert.rejects(controller.execute({
    ...base,
    steps: [
      { id: 'first', action: COMPUTER_USE_ACTIONS.SCREENSHOT },
      { id: 'scroll', action: COMPUTER_USE_ACTIONS.SCROLL },
    ],
  }), error => error.code === 'SCROLL_DELTA_INVALID');
  assert.deepEqual(performed, []);
  assert.equal(audits.at(-1).status, 'DENIED');
  assert.equal(audits.at(-1).completed_steps, 0);
});


test('GEN2-30 refuses numeric values outside native Windows Int32 rather than overflow', () => {
  for (const [step, reason] of [
    [{ id: 'cursor', action: COMPUTER_USE_ACTIONS.CURSOR_MOVE, x: 2147483648, y: 20 }, 'POINTER_COORDINATES_INVALID'],
    [{ id: 'cursor', action: COMPUTER_USE_ACTIONS.CURSOR_MOVE, x: -2147483649, y: 20 }, 'POINTER_COORDINATES_INVALID'],
    [{ id: 'cursor', action: COMPUTER_USE_ACTIONS.CURSOR_MOVE, x: 9007199254740991, y: 20 }, 'POINTER_COORDINATES_INVALID'],
    [{ id: 'scroll', action: COMPUTER_USE_ACTIONS.SCROLL, delta_y: -2147483649 }, 'SCROLL_DELTA_INVALID'],
    [{ id: 'scroll', action: COMPUTER_USE_ACTIONS.SCROLL, delta_y: '2147483648' }, 'SCROLL_DELTA_INVALID'],
  ]) {
    const rejected = evaluateComputerUsePlan({ ...base, steps: [step] });
    assert.equal(rejected.allowed, false, step.id);
    assert.equal(rejected.reason, reason, step.id);
  }

  assert.equal(evaluateComputerUsePlan({
    ...base,
    steps: [
      { id: 'cursor', action: COMPUTER_USE_ACTIONS.CURSOR_MOVE, x: -2147483648, y: 2147483647 },
      { id: 'scroll', action: COMPUTER_USE_ACTIONS.SCROLL, delta_y: -2147483648 },
    ],
  }).allowed, true);
});

test('GEN2-30 never dispatches a plan with overflowing native Windows coordinates', async () => {
  const performed = [];
  const audits = [];
  const controller = createComputerUseController({
    adapter: { perform: async step => performed.push(step) },
    authorize: async () => true,
    audit: async entry => audits.push(entry),
  });
  await assert.rejects(
    controller.execute({
      ...base,
      steps: [
        { id: 'valid', action: COMPUTER_USE_ACTIONS.SCREENSHOT },
        { id: 'invalid', action: COMPUTER_USE_ACTIONS.CURSOR_MOVE, x: 2147483648, y: 0 },
      ],
    }),
    error => error.code === 'POINTER_COORDINATES_INVALID',
  );
  assert.deepEqual(performed, []);
  assert.equal(audits.at(-1).status, 'DENIED');
  assert.equal(audits.at(-1).completed_steps, 0);
});


test('GEN2-30 permits only Windows Key-Token-safe keypresses', () => {
  const invalid = ['^', '+', '%', '~', '{', '}', '(', ')', 'CTRL+X', 'ALT+F4', 'CTRL+ALT+DELETE', 'FOO', 'F13'];
  for (const key of invalid) {
    const denied = evaluateComputerUsePlan({
      ...base,
      steps: [{ id: 'press', action: COMPUTER_USE_ACTIONS.KEY_PRESS, key }],
    });
    assert.equal(denied.allowed, false, key);
    assert.equal(denied.reason, 'KEY_NOT_SUPPORTED', key);
  }
  for (const key of ['a', 'Z', '1', 'ENTER', 'TAB', 'CTRL+S', 'ALT+TAB', 'F12']) {
    const permitted = evaluateComputerUsePlan({
      ...base,
      steps: [{ id: 'press', action: COMPUTER_USE_ACTIONS.KEY_PRESS, key }],
    });
    assert.equal(permitted.allowed, true, key);
  }
});

test('GEN2-30 never sends SendKeys metacharacters after earlier approved PC steps', async () => {
  const performed = [];
  const audits = [];
  const controller = createComputerUseController({
    adapter: { perform: async step => performed.push(step) },
    authorize: async () => true,
    audit: async entry => audits.push(entry),
  });
  await assert.rejects(
    controller.execute({
      ...base,
      steps: [
        { id: 'first', action: COMPUTER_USE_ACTIONS.SCREENSHOT },
        { id: 'press', action: COMPUTER_USE_ACTIONS.KEY_PRESS, key: '^' },
      ],
    }),
    error => error.code === 'KEY_NOT_SUPPORTED',
  );
  assert.deepEqual(performed, []);
  assert.equal(audits.at(-1).status, 'DENIED');
  assert.equal(audits.at(-1).completed_steps, 0);
});
