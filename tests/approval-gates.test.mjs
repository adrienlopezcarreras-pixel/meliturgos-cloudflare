import test from 'node:test';
import assert from 'node:assert/strict';

import {
  approvedCapabilitiesFromRequest,
  assertCapabilityApproval,
  normalizeCapabilityApprovalPolicy,
  normalizeStepApprovals,
  stepApprovalMatches,
} from '../src/security/approval-gates.js';

test('WORK-03 parses exact bounded capability approvals from trusted request header', () => {
  const request = new Request('https://mel.test/api/chat', {
    headers: {
      'x-mel-approve-capability': 'conversation.archive, fixture.destructive, conversation.archive, *, bad value',
    },
  });
  assert.deepEqual(
    approvedCapabilitiesFromRequest(request),
    ['conversation.archive', 'fixture.destructive'],
  );
});

test('WORK-03 capability approval is fail-closed and cannot be self-approved from tool input', () => {
  const record = {
    id: 'fixture.destructive',
    approval: { required: true, scope: 'fixture.destructive', reason: 'TEST_MUTATION' },
  };
  assert.equal(normalizeCapabilityApprovalPolicy(record.approval)?.required, true);

  for (const context of [
    {},
    { approvedCapabilities: [] },
    { approvedCapabilities: ['other.capability'] },
    { approvedCapabilities: ['*'] },
    { approvedCapabilities: [{ id:'fixture.destructive', confirm:true }] },
  ]) {
    assert.throws(
      () => assertCapabilityApproval(record, context),
      error => error.code === 'EXPLICIT_APPROVAL_REQUIRED' && error.status === 409,
    );
  }

  assert.equal(
    assertCapabilityApproval(record, { approvedCapabilities: ['fixture.destructive'] }),
    true,
  );

  // Capability input is deliberately not part of the approval API.
  assert.throws(
    () => assertCapabilityApproval(record, {
      approvedCapabilities: [],
      input: { confirm: true, approved: true },
    }),
    error => error.code === 'EXPLICIT_APPROVAL_REQUIRED',
  );
});

test('WORK-03 does not burden capabilities that are not marked destructive', () => {
  assert.equal(assertCapabilityApproval({ id:'fixture.readonly' }, {}), true);
});

test('WORK-03 central step approvals remain exact to session, step and action', () => {
  const approvals = normalizeStepApprovals([
    { approved:true, session_id:'session-1', step_id:'step-1', action:'keyboard.type' },
  ], 10);
  assert.equal(stepApprovalMatches(approvals, 'session-1', { id:'step-1', action:'keyboard.type' }), true);
  assert.equal(stepApprovalMatches(approvals, 'session-2', { id:'step-1', action:'keyboard.type' }), false);
  assert.equal(stepApprovalMatches(approvals, 'session-1', { id:'step-2', action:'keyboard.type' }), false);
  assert.equal(stepApprovalMatches(approvals, 'session-1', { id:'step-1', action:'app.open' }), false);
});
