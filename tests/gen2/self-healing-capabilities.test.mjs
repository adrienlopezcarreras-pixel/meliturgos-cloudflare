import test from 'node:test';
import assert from 'node:assert/strict';

import { CapabilityBus } from '../../src/capabilities/capability-bus.js';
import { D1DevJobRepository } from '../../src/dev/d1-dev-job-repository.js';
import { registerSelfHealingCapabilities } from '../../src/capabilities/self-healing-capabilities.js';

function configuredBus() {
  const calls = { build: 0, apply: 0, rollback: 0 };
  const bus = new CapabilityBus();
  registerSelfHealingCapabilities(bus, {
    MEL_SELF_HEALING_REPOSITORY: new D1DevJobRepository(null),
    MEL_SELF_HEALING_ADAPTERS: {
      detect: async ({ incident_id }) => ({
        detected: true,
        severity: 'high',
        evidence: [`detected:${incident_id}`],
      }),
      diagnose: async () => ({ summary: 'regression detected', suspected_causes: ['fixture'] }),
      buildCandidate: async ({ repair_id }) => {
        calls.build += 1;
        return { candidate_ref: `candidate:${repair_id}`, branch: 'candidate/mel-clean-autonomy' };
      },
      testCandidate: async () => ({
        passed: true,
        tests: [{ name: 'targeted', passed: true, evidence: 'green' }],
      }),
      applyRepair: async ({ repair }) => {
        calls.apply += 1;
        return { applied: true, target: repair.target };
      },
      rollback: async ({ restore_ref }) => {
        calls.rollback += 1;
        return { restored: true, restore_ref };
      },
    },
  });
  return { bus, calls };
}

const baseContext = {
  owner: 'owner',
  permissions: [],
  requestId: 'self-healing-test',
};

test('self-healing policy preview is always available and never executes adapters', async () => {
  const bus = new CapabilityBus();
  registerSelfHealingCapabilities(bus, {});
  const result = await bus.execute('self-healing.policy.preview', {
    incident: {
      id: 'incident-preview',
      detected: true,
      severity: 'high',
      evidence: ['proof'],
    },
  }, baseContext);

  assert.equal(result.ok, true);
  assert.equal(result.executed, false);
  assert.equal(result.plan.action, 'OBSERVE');
  assert.equal(bus.describe('self-healing.inspect').health, 'UNAVAILABLE');
});

test('self-healing inspect persists diagnosis without explicit mutation approval', async () => {
  const { bus, calls } = configuredBus();
  const result = await bus.execute('self-healing.inspect', {
    incident_id: 'incident-1',
    signal: { source: 'smoke' },
  }, baseContext);

  assert.equal(result.status, 'SELF_HEALING_DIAGNOSED');
  assert.equal(calls.build, 0);
  assert.equal(calls.apply, 0);
});

test('self-healing prepare requires CapabilityBus approval before candidate construction', async () => {
  const { bus, calls } = configuredBus();
  await bus.execute('self-healing.inspect', { incident_id: 'incident-2' }, baseContext);

  await assert.rejects(
    () => bus.execute('self-healing.prepare', {
      incident_id: 'incident-2',
      repair_id: 'repair-2',
      rollback_ref: 'sha:good',
    }, baseContext),
    { code: 'EXPLICIT_APPROVAL_REQUIRED', status: 409 },
  );
  assert.equal(calls.build, 0);

  const prepared = await bus.execute('self-healing.prepare', {
    incident_id: 'incident-2',
    repair_id: 'repair-2',
    rollback_ref: 'sha:good',
  }, {
    ...baseContext,
    approvedCapabilities: ['self-healing.prepare'],
  });
  assert.equal(prepared.status, 'SELF_HEALING_REPAIR_READY');
  assert.equal(calls.build, 1);
});

test('self-healing apply has a separate approval gate and keeps owner halt authoritative', async () => {
  const { bus, calls } = configuredBus();
  await bus.execute('self-healing.inspect', { incident_id: 'incident-3' }, baseContext);
  await bus.execute('self-healing.prepare', {
    incident_id: 'incident-3',
    repair_id: 'repair-3',
    rollback_ref: 'sha:good',
  }, {
    ...baseContext,
    approvedCapabilities: ['self-healing.prepare'],
  });

  await assert.rejects(
    () => bus.execute('self-healing.apply', { incident_id: 'incident-3' }, baseContext),
    { code: 'EXPLICIT_APPROVAL_REQUIRED', status: 409 },
  );

  const halted = await bus.execute('self-healing.apply', {
    incident_id: 'incident-3',
    owner_halt: true,
  }, {
    ...baseContext,
    approvedCapabilities: ['self-healing.apply'],
  });
  assert.equal(halted.status, 'SELF_HEALING_REPAIR_BLOCKED');
  assert.equal(halted.state.policy.reason, 'OWNER_HALT_ACTIVE');
  assert.equal(calls.apply, 0);
});

test('production self-healing requires both capability approval and exact repair approval', async () => {
  const { bus, calls } = configuredBus();
  await bus.execute('self-healing.inspect', { incident_id: 'incident-prod' }, baseContext);
  await bus.execute('self-healing.prepare', {
    incident_id: 'incident-prod',
    repair_id: 'repair-prod',
    target: 'production',
    rollback_ref: 'release:good',
  }, {
    ...baseContext,
    approvedCapabilities: ['self-healing.prepare'],
  });

  const blocked = await bus.execute('self-healing.apply', {
    incident_id: 'incident-prod',
  }, {
    ...baseContext,
    approvedCapabilities: ['self-healing.apply'],
  });
  assert.equal(blocked.status, 'SELF_HEALING_REPAIR_BLOCKED');
  assert.equal(blocked.state.policy.reason, 'PRODUCTION_REPAIR_APPROVAL_REQUIRED');
  assert.equal(calls.apply, 0);

  const approved = await bus.execute('self-healing.apply', {
    incident_id: 'incident-prod',
    approval: {
      approved: true,
      action: 'REPAIR',
      incident_id: 'incident-prod',
      repair_id: 'repair-prod',
    },
  }, {
    ...baseContext,
    approvedCapabilities: ['self-healing.apply'],
  });
  assert.equal(approved.status, 'SELF_HEALING_PRODUCTION_REPAIRED');
  assert.equal(calls.apply, 1);
});

test('rollback requires both CapabilityBus approval and incident-scoped rollback approval', async () => {
  const { bus, calls } = configuredBus();
  await bus.execute('self-healing.inspect', { incident_id: 'incident-rb' }, baseContext);

  await assert.rejects(
    () => bus.execute('self-healing.rollback', {
      incident_id: 'incident-rb',
      restore_ref: 'release:good',
      approval: { approved: true, action: 'ROLLBACK', incident_id: 'incident-rb' },
    }, baseContext),
    { code: 'EXPLICIT_APPROVAL_REQUIRED', status: 409 },
  );

  const blocked = await bus.execute('self-healing.rollback', {
    incident_id: 'incident-rb',
    restore_ref: 'release:good',
    approval: { approved: false, action: 'ROLLBACK', incident_id: 'incident-rb' },
  }, {
    ...baseContext,
    approvedCapabilities: ['self-healing.rollback'],
  });
  assert.equal(blocked.status, 'SELF_HEALING_ROLLBACK_BLOCKED');
  assert.equal(calls.rollback, 0);

  const approved = await bus.execute('self-healing.rollback', {
    incident_id: 'incident-rb',
    restore_ref: 'release:good',
    approval: { approved: true, action: 'ROLLBACK', incident_id: 'incident-rb' },
  }, {
    ...baseContext,
    approvedCapabilities: ['self-healing.rollback'],
  });
  assert.equal(approved.status, 'SELF_HEALING_ROLLED_BACK');
  assert.equal(calls.rollback, 1);
});
