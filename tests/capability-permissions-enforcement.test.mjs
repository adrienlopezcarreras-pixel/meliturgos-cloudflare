import test from 'node:test';
import assert from 'node:assert/strict';
import { CapabilityBus } from '../src/capabilities/capability-bus.js';

function securedBus(audit = async () => {}) {
  const bus = new CapabilityBus({ audit });
  bus.discover({
    id: 'fixture.secured',
    name: 'Secured fixture',
    category: 'test',
    version: '1.0.0',
    provider: 'test',
    description: 'Permission enforcement fixture.',
    input_schema: {
      type: 'object',
      properties: { value: { type: 'string', minLength: 1, maxLength: 100 } },
      required: ['value'],
      additionalProperties: false,
    },
    output_schema: {
      type: 'object',
      properties: { value: { type: 'string', minLength: 1, maxLength: 100 } },
      required: ['value'],
      additionalProperties: false,
    },
    risk: 'MEDIUM',
    permissions: ['fixture.execute'],
    health: 'HEALTHY',
    enabled: true,
  }, async input => ({ value: input.value }));
  return bus;
}

test('MEL-SEC-02 denies capability execution without authenticated owner context', async () => {
  const bus = securedBus();
  await assert.rejects(
    () => bus.execute('fixture.secured', { value: 'x' }, { permissions: ['fixture.execute'], requestId: 'r1' }),
    error => error?.message === 'AUTH_REQUIRED' || error?.code === 'AUTH_REQUIRED',
  );
});

test('MEL-SEC-02 denies capability execution when a required permission is absent', async () => {
  const bus = securedBus();
  await assert.rejects(
    () => bus.execute('fixture.secured', { value: 'x' }, { owner: 'owner', permissions: [], requestId: 'r2' }),
    error => error?.message === 'PERMISSION_DENIED' || error?.code === 'PERMISSION_DENIED',
  );
});

test('MEL-SEC-02 permits execution only when every declared capability permission is present', async () => {
  const events = [];
  const bus = securedBus(async event => events.push(event));
  const result = await bus.execute('fixture.secured', { value: 'ok' }, {
    owner: 'owner',
    permissions: ['fixture.execute'],
    requestId: 'r3',
  });
  assert.deepEqual(result, { value: 'ok' });
  assert.deepEqual(events.map(row => row.status), ['STARTED', 'SUCCEEDED']);
  assert.equal(bus.contract('fixture.secured').authorization_gate, true);
});

test('MEL-SEC-02 capability enable/disable administration itself requires capabilities.manage', async () => {
  const bus = securedBus();

  assert.throws(
    () => bus.disable('fixture.secured', { owner: 'owner', permissions: [] }),
    error => error?.message === 'PERMISSION_DENIED' || error?.code === 'PERMISSION_DENIED',
  );

  bus.disable('fixture.secured', { owner: 'owner', permissions: ['capabilities.manage'] });
  assert.equal(bus.describe('fixture.secured').enabled, false);

  await assert.rejects(
    () => bus.execute('fixture.secured', { value: 'x' }, {
      owner: 'owner',
      permissions: ['fixture.execute'],
      requestId: 'r4',
    }),
    error => error?.message === 'CAPABILITY_DISABLED' || error?.code === 'CAPABILITY_DISABLED',
  );

  bus.enable('fixture.secured', { owner: 'owner', permissions: ['capabilities.manage'] });
  assert.equal(bus.describe('fixture.secured').enabled, true);
});

test('MEL-SEC-02 validates input only after authorization and validates output before returning it', async () => {
  const bus = securedBus();
  await assert.rejects(
    () => bus.execute('fixture.secured', { unknown: true }, {
      owner: 'owner',
      permissions: ['fixture.execute'],
      requestId: 'r5',
    }),
    error => ['MISSING_FIELD','UNKNOWN_FIELD','INVALID_TYPE'].includes(error?.message) || ['MISSING_FIELD','UNKNOWN_FIELD','INVALID_TYPE'].includes(error?.code),
  );

  const bad = new CapabilityBus();
  bad.discover({
    id: 'fixture.bad-output',
    name: 'Bad output',
    category: 'test',
    version: '1.0.0',
    provider: 'test',
    description: 'Output validation fixture.',
    input_schema: { type: 'object', additionalProperties: false },
    output_schema: {
      type: 'object',
      properties: { ok: { type: 'boolean' } },
      required: ['ok'],
      additionalProperties: false,
    },
    risk: 'LOW',
    permissions: [],
    health: 'HEALTHY',
    enabled: true,
  }, async () => ({ not_ok: true }));

  await assert.rejects(
    () => bad.execute('fixture.bad-output', {}, { owner: 'owner', permissions: [], requestId: 'r6' }),
    error => error?.message === 'MISSING_FIELD' || error?.code === 'MISSING_FIELD',
  );
});


function destructiveBus(audit = async () => {}) {
  const bus = new CapabilityBus({ audit });
  let executions = 0;
  bus.discover({
    id: 'fixture.destructive',
    name: 'Destructive fixture',
    category: 'test',
    version: '1.0.0',
    provider: 'test',
    description: 'Mutation that must require explicit owner approval.',
    input_schema: {
      type: 'object',
      properties: {
        value: { type: 'string', minLength: 1, maxLength: 100 },
        confirm: { type: 'boolean' },
      },
      required: ['value'],
      additionalProperties: false,
    },
    output_schema: {
      type: 'object',
      properties: { value: { type: 'string' } },
      required: ['value'],
      additionalProperties: false,
    },
    risk: 'HIGH',
    permissions: [],
    approval: { required: true, scope: 'fixture.destructive', reason: 'TEST_MUTATION' },
    health: 'HEALTHY',
    enabled: true,
  }, async input => {
    executions += 1;
    return { value: input.value };
  });
  return { bus, executions: () => executions };
}

test('MEL-WORK-03 central CapabilityBus approval gate denies destructive execution before handler or input self-confirmation can run', async () => {
  const events = [];
  const fixture = destructiveBus(async event => events.push(event));

  await assert.rejects(
    () => fixture.bus.execute('fixture.destructive', { value:'x', confirm:true }, {
      owner:'owner',
      permissions:[],
      requestId:'approval-denied',
    }),
    error => error.code === 'EXPLICIT_APPROVAL_REQUIRED',
  );

  assert.equal(fixture.executions(), 0);
  assert.equal(events.at(-1)?.status, 'DENIED');
  assert.equal(events.at(-1)?.reason, 'EXPLICIT_APPROVAL_REQUIRED');
  const contract = fixture.bus.contract('fixture.destructive');
  assert.equal(contract.explicit_approval_gate, true);
  assert.equal(contract.approval_policy_valid, true);
});

test('MEL-WORK-03 destructive capability executes only with exact trusted approval scope', async () => {
  const fixture = destructiveBus();
  await assert.rejects(
    () => fixture.bus.execute('fixture.destructive', { value:'x' }, {
      owner:'owner',
      permissions:[],
      approvedCapabilities:['fixture.other'],
      requestId:'approval-wrong',
    }),
    error => error.code === 'EXPLICIT_APPROVAL_REQUIRED',
  );

  const result = await fixture.bus.execute('fixture.destructive', { value:'approved' }, {
    owner:'owner',
    permissions:[],
    approvedCapabilities:['fixture.destructive'],
    requestId:'approval-ok',
  });
  assert.deepEqual(result, { value:'approved' });
  assert.equal(fixture.executions(), 1);
});
