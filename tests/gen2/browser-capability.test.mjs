import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BROWSER_ACTIONS,
  BROWSER_RISK,
  classifyBrowserAction,
  createBrowserController,
  evaluateBrowserPlan,
  normalizeBrowserRequest,
} from '../../src/devices/browser-capability.js';

const baseRequest = () => ({
  session_id: 'session-1',
  device: { id: 'pc-1', capabilities: ['browser.control'] },
  sandbox: { allowed_origins: ['https://example.com'], max_steps: 10 },
  approvals: [],
  steps: [
    { id: 'nav', action: BROWSER_ACTIONS.NAVIGATE, url: 'https://example.com/start' },
    { id: 'read', action: BROWSER_ACTIONS.READ_TEXT },
  ],
});

test('classifies browser actions conservatively', () => {
  assert.equal(classifyBrowserAction(BROWSER_ACTIONS.READ_TEXT), BROWSER_RISK.OBSERVE);
  assert.equal(classifyBrowserAction(BROWSER_ACTIONS.CLICK), BROWSER_RISK.INTERACT);
  assert.equal(classifyBrowserAction(BROWSER_ACTIONS.TYPE), BROWSER_RISK.SENSITIVE);
  assert.equal(classifyBrowserAction('javascript.eval'), BROWSER_RISK.DENY);
  assert.equal(classifyBrowserAction('unknown.action'), BROWSER_RISK.DENY);
});

test('normalization strips credentials and refuses non-HTTPS URLs', () => {
  const request = normalizeBrowserRequest({
    ...baseRequest(),
    steps: [
      { id: 'a', action: BROWSER_ACTIONS.NAVIGATE, url: 'https://user:pass@example.com/path' },
      { id: 'b', action: BROWSER_ACTIONS.NAVIGATE, url: 'http://example.com/' },
    ],
  });
  assert.equal(request.steps[0].url, 'https://example.com/path');
  assert.equal(request.steps[1].url, '');
  assert.equal(request.steps[1].url_supplied, true);
});

test('allows bounded observation inside the sandbox', () => {
  const plan = evaluateBrowserPlan(baseRequest());
  assert.equal(plan.allowed, true);
  assert.equal(plan.reason, 'PLAN_AUTHORIZED');
  assert.equal(plan.decisions.length, 2);
});

test('fails closed outside allowed origins and on unsafe schemes', () => {
  const outside = evaluateBrowserPlan({
    ...baseRequest(),
    steps: [{ id: 'nav', action: BROWSER_ACTIONS.NAVIGATE, url: 'https://other.example/' }],
  });
  assert.equal(outside.allowed, false);
  assert.equal(outside.reason, 'ORIGIN_OUTSIDE_SANDBOX');

  const insecure = evaluateBrowserPlan({
    ...baseRequest(),
    steps: [{ id: 'nav', action: BROWSER_ACTIONS.NAVIGATE, url: 'javascript:alert(1)' }],
  });
  assert.equal(insecure.allowed, false);
  assert.equal(insecure.reason, 'HTTPS_URL_REQUIRED');
});

test('requires exact approval for sensitive browser actions', () => {
  const request = {
    ...baseRequest(),
    steps: [{ id: 'type-1', action: BROWSER_ACTIONS.TYPE, text: 'hello' }],
  };
  const denied = evaluateBrowserPlan(request);
  assert.equal(denied.allowed, false);
  assert.equal(denied.reason, 'EXPLICIT_STEP_APPROVAL_REQUIRED');

  const approved = evaluateBrowserPlan({
    ...request,
    approvals: [{ approved: true, session_id: 'session-1', step_id: 'type-1', action: BROWSER_ACTIONS.TYPE }],
  });
  assert.equal(approved.allowed, true);
});

test('owner halt and missing device capability always win', () => {
  const halted = evaluateBrowserPlan({ ...baseRequest(), owner_halt: true });
  assert.equal(halted.allowed, false);
  assert.equal(halted.reason, 'OWNER_HALT_ACTIVE');

  const noCapability = evaluateBrowserPlan({
    ...baseRequest(),
    device: { id: 'pc-1', capabilities: [] },
  });
  assert.equal(noCapability.allowed, false);
  assert.equal(noCapability.reason, 'BROWSER_CONTROL_CAPABILITY_REQUIRED');
});

test('controller never calls adapter without global authorization', async () => {
  let calls = 0;
  const audits = [];
  const controller = createBrowserController({
    adapter: { async perform() { calls += 1; } },
    authorize: async () => false,
    audit: async event => audits.push(event),
  });

  await assert.rejects(() => controller.execute(baseRequest(), { owner: 'adrien', requestId: 'r1' }), {
    code: 'GLOBAL_PERMISSION_DENIED',
  });
  assert.equal(calls, 0);
  assert.equal(audits.at(-1).status, 'DENIED');
});

test('controller executes authorized steps and audit omits typed secrets', async () => {
  const calls = [];
  const audits = [];
  const request = {
    ...baseRequest(),
    approvals: [{ approved: true, session_id: 'session-1', step_id: 'type-1', action: BROWSER_ACTIONS.TYPE }],
    steps: [
      { id: 'nav', action: BROWSER_ACTIONS.NAVIGATE, url: 'https://example.com/form' },
      { id: 'type-1', action: BROWSER_ACTIONS.TYPE, text: 'private-value' },
    ],
  };
  const controller = createBrowserController({
    adapter: {
      async perform(step, context) {
        calls.push({ step, context });
        return { action: step.action };
      },
    },
    authorize: async permission => permission === 'browser:control',
    audit: async event => audits.push(event),
  });

  const output = await controller.execute(request, { owner: 'adrien', requestId: 'r2' });
  assert.equal(output.ok, true);
  assert.equal(output.steps_completed, 2);
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[0].context.allowedOrigins, ['https://example.com']);
  assert.equal(audits.at(-1).status, 'COMPLETED');
  assert.equal(JSON.stringify(audits).includes('private-value'), false);
});


test('owner halt is terminal before controller authorization or adapter work', async () => {
  let authorizeCalls = 0;
  let adapterCalls = 0;
  const audits = [];
  const controller = createBrowserController({
    adapter: {
      async perform() {
        adapterCalls += 1;
        return {};
      },
    },
    authorize: async () => {
      authorizeCalls += 1;
      return false;
    },
    audit: async event => audits.push(event),
  });

  await assert.rejects(() => controller.execute({
    ...baseRequest(),
    owner_halt: true,
  }, { owner: 'adrien', requestId: 'halt-1' }), {
    code: 'OWNER_HALT_ACTIVE',
    status: 409,
  });

  assert.equal(authorizeCalls, 0);
  assert.equal(adapterCalls, 0);
  assert.equal(audits.at(-1).reason, 'OWNER_HALT_ACTIVE');
});

test('controller preserves companion status and audits only structured step metadata', async () => {
  const audits = [];
  const controller = createBrowserController({
    adapter: {
      async perform() {
        const error = new Error('provider detail should not leak');
        error.code = 'BROWSER_COMPANION_TIMEOUT';
        error.status = 504;
        throw error;
      },
    },
    authorize: async () => true,
    audit: async event => audits.push(event),
  });

  await assert.rejects(() => controller.execute(baseRequest(), {
    owner: 'adrien',
    permissions: ['browser.control'],
    requestId: 'timeout-1',
  }), {
    code: 'BROWSER_COMPANION_TIMEOUT',
    status: 504,
  });

  const failed = audits.at(-1);
  assert.equal(failed.status, 'FAILED');
  assert.deepEqual(failed.step_results, [{
    step_id: 'nav',
    ok: false,
    code: 'BROWSER_COMPANION_TIMEOUT',
  }]);
  assert.equal(JSON.stringify(failed).includes('provider detail should not leak'), false);
});
