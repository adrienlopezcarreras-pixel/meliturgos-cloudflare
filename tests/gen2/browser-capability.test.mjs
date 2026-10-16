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
  assert.equal(classifyBrowserAction(BROWSER_ACTIONS.UPLOAD_FILE), BROWSER_RISK.SENSITIVE);
  assert.equal(classifyBrowserAction(BROWSER_ACTIONS.SET_HEADERS), BROWSER_RISK.SENSITIVE);
  assert.equal(classifyBrowserAction(BROWSER_ACTIONS.WAIT_TEXT), BROWSER_RISK.OBSERVE);
  assert.equal(classifyBrowserAction('javascript.eval'), BROWSER_RISK.DENY);
  assert.equal(classifyBrowserAction('unknown.action'), BROWSER_RISK.DENY);
});

test('normalization rejects credential-bearing and non-HTTPS URLs instead of modifying them', () => {
  const request = normalizeBrowserRequest({
    ...baseRequest(),
    steps: [
      { id: 'a', action: BROWSER_ACTIONS.NAVIGATE, url: 'https://user:pass@example.com/path' },
      { id: 'b', action: BROWSER_ACTIONS.NAVIGATE, url: 'http://example.com/' },
    ],
  });
  assert.equal(request.steps[0].url, '');
  assert.equal(request.steps[0].url_supplied, true);
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

test('file upload requires exact approval and bounds inline file content', () => {
  const request = {
    ...baseRequest(),
    steps: [{
      id: 'upload-1',
      action: BROWSER_ACTIONS.UPLOAD_FILE,
      selector: '#file',
      file_name: 'proof.txt',
      mime_type: 'text/plain',
      file_text: 'proof-content',
    }],
  };
  const denied = evaluateBrowserPlan(request);
  assert.equal(denied.allowed, false);
  assert.equal(denied.reason, 'EXPLICIT_STEP_APPROVAL_REQUIRED');

  const approved = evaluateBrowserPlan({
    ...request,
    approvals: [{ approved:true, session_id:'session-1', step_id:'upload-1', action:BROWSER_ACTIONS.UPLOAD_FILE }],
  });
  assert.equal(approved.allowed, true);
  assert.equal(approved.request.steps[0].file_name, 'proof.txt');
  assert.equal(approved.request.steps[0].file_text, 'proof-content');

  const bounded = normalizeBrowserRequest({
    ...request,
    steps: [{ ...request.steps[0], file_text:'x'.repeat(20000) }],
  });
  assert.equal(bounded.steps[0].file_text.length, 16384);
});

test('browser headers require an exact sensitive action and reject forbidden names', () => {
  const request = {
    ...baseRequest(),
    steps: [{
      id: 'headers-1',
      action: BROWSER_ACTIONS.SET_HEADERS,
      headers: {
        'x-mel-release-smoke': '1',
        'x-mel-launch-bootstrap': 'token-value',
      },
    }],
  };
  const denied = evaluateBrowserPlan(request);
  assert.equal(denied.allowed, false);
  assert.equal(denied.reason, 'EXPLICIT_STEP_APPROVAL_REQUIRED');

  const approvals = [{ approved: true, session_id: 'session-1',
    step_id: 'headers-1', action: BROWSER_ACTIONS.SET_HEADERS }];
  const approved = evaluateBrowserPlan({ ...request, approvals });
  assert.equal(approved.allowed, true);
  assert.deepEqual(approved.request.steps[0].headers, request.steps[0].headers);

  const unsafe = evaluateBrowserPlan({
    ...request,
    approvals,
    steps: [{ ...request.steps[0], headers: {
      ...request.steps[0].headers, 'x-unsafe-header': 'must-not-drop-silently',
    } }],
  });
  assert.equal(unsafe.allowed, false);
  assert.equal(unsafe.reason, 'BROWSER_HEADER_POLICY_VIOLATION');

  for (const headers of [
    { authorization: 'Bearer secret' },
    { 'x-mel-release-smoke': '1' },
  ]) {
    const smuggled = evaluateBrowserPlan({
      ...request,
      steps: [{ id: 'nav', action: BROWSER_ACTIONS.NAVIGATE,
        url: 'https://example.com/', headers }],
    });
    assert.equal(smuggled.allowed, false);
    assert.equal(smuggled.reason, 'BROWSER_HEADER_POLICY_VIOLATION');
  }
});

test('GEN2-31 refuses header smuggling before authorization or adapter execution', async () => {
  let adapterCalls = 0;
  const audits = [];
  const controller = createBrowserController({
    adapter: { async perform() { adapterCalls += 1; } },
    authorize: async () => true,
    audit: async entry => audits.push(entry),
  });
  await assert.rejects(controller.execute({
    ...baseRequest(),
    steps: [{
      id: 'nav', action: BROWSER_ACTIONS.NAVIGATE,
      url: 'https://example.com/', headers: { authorization: 'Bearer secret' },
    }],
  }), error => error.code === 'BROWSER_HEADER_POLICY_VIOLATION');
  assert.equal(adapterCalls, 0);
  assert.equal(audits.at(-1).status, 'DENIED');
  assert.equal(audits.at(-1).completed_steps, 0);
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

test('controller preserves the bounded failed step id without leaking adapter detail', async () => {
  const controller=createBrowserController({
    adapter:{
      async perform(step){
        if(step.id==='read'){
          const error=new Error('private adapter detail');
          error.code='BROWSER_TEXT_NOT_FOUND';
          error.status=408;
          throw error;
        }
        return {ok:true};
      },
    },
    authorize:async()=>true,
    audit:async()=>{},
  });
  await assert.rejects(
    ()=>controller.execute(baseRequest(),{owner:'adrien',permissions:['browser.control']}),
    error=>error?.code==='BROWSER_TEXT_NOT_FOUND'
      && error?.status===408
      && error?.step_id==='read'
      && !String(error?.message||'').includes('private adapter detail'),
  );
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


test('GEN2-31 refuses silently truncated browser plans and step targets', () => {
  const base = baseRequest();
  const cases = [
    {
      steps: [...base.steps, ...Array.from({ length: 9 }, (_, n) =>
        ({ id: 'extra-' + n, action: BROWSER_ACTIONS.READ_TEXT }))],
      reason: 'BROWSER_STEP_LIMIT_EXCEEDED',
    },
    {
      steps: [{ id: 'nav', action: BROWSER_ACTIONS.NAVIGATE,
        url: 'https://example.com/' + 'a'.repeat(4100) }],
      reason: 'BROWSER_STEP_FIELD_LIMIT_EXCEEDED',
    },
    {
      steps: [{ id: 'read', action: BROWSER_ACTIONS.READ_TEXT, selector: 'a'.repeat(1001) }],
      reason: 'BROWSER_STEP_FIELD_LIMIT_EXCEEDED',
    },
    {
      steps: [{ id: 'type', action: BROWSER_ACTIONS.TYPE, text: 'S'.repeat(8193) }],
      reason: 'BROWSER_TEXT_LIMIT_EXCEEDED',
    },
    {
      steps: [{ id: 'upload', action: BROWSER_ACTIONS.UPLOAD_FILE,
        file_name: 'proof.txt', file_text: 'D'.repeat(16385) }],
      reason: 'BROWSER_FILE_TEXT_LIMIT_EXCEEDED',
    },
    {
      steps: [{ id: 'header', action: BROWSER_ACTIONS.SET_HEADERS,
        headers: { 'x-mel-release-smoke': 'H'.repeat(2049) } }],
      reason: 'BROWSER_HEADER_VALUE_LIMIT_EXCEEDED',
    },
  ];
  for (const { steps, reason } of cases) {
    const plan = evaluateBrowserPlan({ ...base, steps });
    assert.equal(plan.allowed, false, reason);
    assert.equal(plan.reason, reason);
    assert.equal(plan.decisions.length, 0, reason);
  }
});

test('GEN2-31 never performs earlier browser steps if later text would be clipped', async () => {
  const calls = [];
  const audits = [];
  const controller = createBrowserController({
    adapter: { async perform(step) { calls.push(step.id); return {}; } },
    authorize: async () => true,
    audit: async event => audits.push(event),
  });
  await assert.rejects(
    controller.execute({
      ...baseRequest(),
      steps: [
        { id: 'read', action: BROWSER_ACTIONS.READ_TEXT },
        { id: 'type', action: BROWSER_ACTIONS.TYPE, text: 'X'.repeat(8193) },
      ],
    }),
    error => error.code === 'BROWSER_TEXT_LIMIT_EXCEEDED',
  );
  assert.deepEqual(calls, []);
  assert.equal(audits.at(-1).status, 'DENIED');
  assert.equal(audits.at(-1).completed_steps, 0);
});


test('GEN2-31 refuses credential-bearing navigations before any adapter action', async () => {
  const requests = [
    {
      ...baseRequest(),
      steps: [{ id: 'nav', action: BROWSER_ACTIONS.NAVIGATE,
        url: 'https://owner:secret@example.com/protected' }],
    },
    {
      ...baseRequest(),
      sandbox: { allowed_origins: ['https://owner:secret@example.com'] },
    },
  ];
  const reasons = ['HTTPS_URL_REQUIRED', 'BROWSER_ALLOWED_ORIGINS_REQUIRED'];
  const calls = [];
  const audits = [];
  const controller = createBrowserController({
    adapter: { async perform(step) { calls.push(step.id); } },
    authorize: async () => true,
    audit: async event => audits.push(event),
  });
  for (const [index, request] of requests.entries()) {
    const plan = evaluateBrowserPlan(request);
    assert.equal(plan.allowed, false);
    assert.equal(plan.reason, reasons[index]);
    await assert.rejects(controller.execute(request),
      error => error.code === reasons[index]);
  }
  assert.deepEqual(calls, []);
  assert.equal(audits.length, 2);
  assert.ok(audits.every(event => event.status === 'DENIED'));
});
