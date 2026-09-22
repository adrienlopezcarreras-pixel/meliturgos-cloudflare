import test from 'node:test';
import assert from 'node:assert/strict';
import { CapabilityBus } from '../src/capabilities/capability-bus.js';
import {
  createExplicitApprovalProof,
  verifyExplicitApproval,
  attachRequestApproval,
  attachTextApproval,
} from '../src/security/explicit-approval.js';

function registerFixture(bus, calls = []) {
  bus.discover({
    id: 'fixture.destructive',
    name: 'Destructive fixture',
    category: 'test',
    version: '1.0.0',
    provider: 'test',
    description: 'Central explicit approval fixture.',
    input_schema: {
      type: 'object',
      properties: { target: { type: 'string', minLength: 1, maxLength: 100 } },
      required: ['target'],
      additionalProperties: false,
    },
    output_schema: {
      type: 'object',
      properties: { ok: { type: 'boolean' } },
      required: ['ok'],
      additionalProperties: false,
    },
    risk: 'HIGH',
    permissions: [],
    health: 'HEALTHY',
    enabled: true,
    approval: { mode: 'EXPLICIT_CURRENT_REQUEST', reason: 'FIXTURE_DESTRUCTIVE' },
    approvalcheck: () => ({ required: true }),
  }, async (_input, context) => {
    calls.push(context.explicitApprovalVerified);
    return { ok: true };
  });
}

test('central gate rejects a destructive capability without current-request approval', async () => {
  const bus = new CapabilityBus();
  registerFixture(bus);
  await assert.rejects(
    () => bus.execute('fixture.destructive', { target: 'alpha' }, {
      owner: 'owner', permissions: [], requestId: 'req-1',
    }),
    error => error?.code === 'EXPLICIT_APPROVAL_REQUIRED' && error?.status === 409,
  );
});

test('a forged serialized approval object cannot bypass the central gate', async () => {
  const bus = new CapabilityBus();
  registerFixture(bus);
  const input = { target: 'alpha' };
  const real = await createExplicitApprovalProof({
    capability: 'fixture.destructive',
    input,
    requestId: 'req-2',
  });
  const forged = JSON.parse(JSON.stringify(real));
  await assert.rejects(
    () => bus.execute('fixture.destructive', input, {
      owner: 'owner', permissions: [], requestId: 'req-2', explicitApprovals: [forged],
    }),
    error => error?.code === 'EXPLICIT_APPROVAL_REQUIRED',
  );
});

test('trusted approval is bound to capability, exact input and requestId', async () => {
  const bus = new CapabilityBus();
  const calls = [];
  registerFixture(bus, calls);
  const input = { target: 'alpha' };
  const proof = await createExplicitApprovalProof({
    capability: 'fixture.destructive',
    input,
    requestId: 'req-3',
    source: 'unit-owner',
  });

  const result = await bus.execute('fixture.destructive', input, {
    owner: 'owner', permissions: [], requestId: 'req-3', explicitApprovals: [proof],
  });
  assert.deepEqual(result, { ok: true });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].capability, 'fixture.destructive');
  assert.equal(calls[0].source, 'unit-owner');

  await assert.rejects(
    () => bus.execute('fixture.destructive', { target: 'beta' }, {
      owner: 'owner', permissions: [], requestId: 'req-3', explicitApprovals: [proof],
    }),
    error => error?.code === 'EXPLICIT_APPROVAL_REQUIRED',
  );
  await assert.rejects(
    () => bus.execute('fixture.destructive', input, {
      owner: 'owner', permissions: [], requestId: 'req-other', explicitApprovals: [proof],
    }),
    error => error?.code === 'EXPLICIT_APPROVAL_REQUIRED',
  );
});

test('expired approval fails closed', async () => {
  const input = { target: 'alpha' };
  const proof = await createExplicitApprovalProof({
    capability: 'fixture.destructive',
    input,
    requestId: 'req-expired',
    approvedAt: 1000,
    ttlMs: 1000,
  });
  const result = await verifyExplicitApproval({
    capability: 'fixture.destructive',
    input,
    context: { requestId: 'req-expired', explicitApprovals: [proof] },
    now: 3000,
  });
  assert.deepEqual(result, { ok: false, code: 'EXPLICIT_APPROVAL_EXPIRED' });
});

test('trusted HTTP and chat boundaries create proofs only on explicit confirmation', async () => {
  const base = { owner: 'owner', permissions: [], requestId: 'req-boundary' };
  const input = { target: 'alpha' };

  const noHeader = await attachRequestApproval(base, {
    request: new Request('https://mel.test/api/gen2/capabilities/execute', { method: 'POST' }),
    capability: 'fixture.destructive',
    input,
  });
  assert.equal(noHeader.explicitApprovals, undefined);

  const confirmed = await attachRequestApproval(base, {
    request: new Request('https://mel.test/api/gen2/capabilities/execute', {
      method: 'POST',
      headers: { 'x-mel-explicit-confirmation': 'CONFIRM' },
    }),
    capability: 'fixture.destructive',
    input,
  });
  assert.equal(confirmed.explicitApprovals.length, 1);

  const chatUnconfirmed = await attachTextApproval(base, {
    text: 'ouvre Chrome',
    capability: 'fixture.destructive',
    input,
  });
  assert.equal(chatUnconfirmed.explicitApprovals, undefined);

  const chatConfirmed = await attachTextApproval(base, {
    text: 'je confirme, ouvre Chrome',
    capability: 'fixture.destructive',
    input,
  });
  assert.equal(chatConfirmed.explicitApprovals.length, 1);
});
