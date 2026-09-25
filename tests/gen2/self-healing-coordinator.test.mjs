import test from 'node:test';
import assert from 'node:assert/strict';

import { D1DevJobRepository } from '../../src/dev/d1-dev-job-repository.js';
import {
  createControlledSelfHealingCoordinator,
  selfHealingJobId,
} from '../../src/resilience/self-healing-coordinator.js';

const detection = {
  detected: true,
  severity: 'high',
  evidence: ['smoke failed', 'integrity mismatch'],
};

function coordinator(overrides = {}) {
  const calls = { build: 0, test: 0, apply: 0, rollback: 0 };
  const repository = new D1DevJobRepository(null);
  const service = createControlledSelfHealingCoordinator({
    repository,
    detect: async () => detection,
    diagnose: async () => ({
      summary: 'candidate regression',
      suspected_causes: ['recent change'],
      evidence: ['failing smoke'],
    }),
    buildCandidate: async ({ repair_id }) => {
      calls.build += 1;
      return { candidate_ref: `candidate:${repair_id}`, branch: 'candidate/mel-clean-autonomy' };
    },
    testCandidate: async () => {
      calls.test += 1;
      return { passed: true, tests: [{ name: 'targeted', passed: true, evidence: 'ok' }] };
    },
    applyRepair: async ({ repair }) => {
      calls.apply += 1;
      return { applied: true, target: repair.target };
    },
    rollback: async ({ restore_ref }) => {
      calls.rollback += 1;
      return { restored: true, restore_ref };
    },
    ...overrides,
  });
  return { service, repository, calls };
}

test('GEN2-18 inspection persists detected evidence and diagnosis without mutation', async () => {
  const { service, repository, calls } = coordinator();
  const result = await service.inspect({ incident_id: 'incident-1', signal: { source: 'smoke' } });

  assert.equal(result.status, 'SELF_HEALING_DIAGNOSED');
  assert.equal(result.state.incident.id, 'incident-1');
  assert.equal(result.state.incident.detected, true);
  assert.equal(result.state.diagnosis.summary, 'candidate regression');
  assert.equal(calls.build, 0);
  assert.equal(calls.apply, 0);
  assert.equal(calls.rollback, 0);

  const persisted = await repository.get(selfHealingJobId('incident-1'));
  assert.equal(persisted.status, 'SELF_HEALING_DIAGNOSED');
  assert.equal(persisted.result_json.self_healing.incident.evidence.length, 2);
});

test('GEN2-18 candidate repair is built, tested and only then applied', async () => {
  const { service, calls } = coordinator();
  await service.inspect({ incident_id: 'incident-2' });

  const prepared = await service.prepareRepair({
    incident_id: 'incident-2',
    repair_id: 'repair-2',
    target: 'candidate',
    rollback_ref: 'sha:known-good',
  });
  assert.equal(prepared.status, 'SELF_HEALING_REPAIR_READY');
  assert.equal(prepared.state.tests.passed, true);
  assert.equal(calls.build, 1);
  assert.equal(calls.test, 1);
  assert.equal(calls.apply, 0);

  const applied = await service.applyPreparedRepair({ incident_id: 'incident-2' });
  assert.equal(applied.status, 'SELF_HEALING_CANDIDATE_REPAIRED');
  assert.equal(calls.apply, 1);
});

test('GEN2-18 failed tests keep repair blocked and never invoke apply adapter', async () => {
  const { service, calls } = coordinator({
    testCandidate: async () => ({
      passed: false,
      tests: [{ name: 'targeted', passed: false, evidence: 'regression remains' }],
    }),
  });
  await service.inspect({ incident_id: 'incident-3' });

  const prepared = await service.prepareRepair({
    incident_id: 'incident-3',
    repair_id: 'repair-3',
    target: 'candidate',
    rollback_ref: 'sha:known-good',
  });
  assert.equal(prepared.status, 'SELF_HEALING_REPAIR_BLOCKED');
  assert.equal(prepared.state.policy.reason, 'TESTED_REPAIR_REQUIRED');

  const blocked = await service.applyPreparedRepair({ incident_id: 'incident-3' });
  assert.equal(blocked.status, 'SELF_HEALING_REPAIR_BLOCKED');
  assert.equal(calls.apply, 0);
});

test('GEN2-18 production repair requires exact incident and repair scoped approval', async () => {
  const { service, calls } = coordinator();
  await service.inspect({ incident_id: 'incident-prod' });
  const prepared = await service.prepareRepair({
    incident_id: 'incident-prod',
    repair_id: 'repair-prod',
    target: 'production',
    rollback_ref: 'release:good',
  });
  assert.equal(prepared.status, 'SELF_HEALING_REPAIR_BLOCKED');
  assert.equal(prepared.state.policy.reason, 'PRODUCTION_REPAIR_APPROVAL_REQUIRED');

  const wrong = await service.applyPreparedRepair({
    incident_id: 'incident-prod',
    approval: {
      approved: true,
      action: 'REPAIR',
      incident_id: 'incident-prod',
      repair_id: 'wrong',
    },
  });
  assert.equal(wrong.status, 'SELF_HEALING_REPAIR_BLOCKED');
  assert.equal(calls.apply, 0);

  const approved = await service.applyPreparedRepair({
    incident_id: 'incident-prod',
    approval: {
      approved: true,
      action: 'REPAIR',
      incident_id: 'incident-prod',
      repair_id: 'repair-prod',
    },
  });
  assert.equal(approved.status, 'SELF_HEALING_PRODUCTION_REPAIRED');
  assert.equal(calls.apply, 1);
});

test('GEN2-18 rollback never executes without explicit incident-scoped approval', async () => {
  const { service, calls } = coordinator();
  await service.inspect({ incident_id: 'incident-rb' });

  const blocked = await service.rollback({
    incident_id: 'incident-rb',
    restore_ref: 'release:known-good',
  });
  assert.equal(blocked.status, 'SELF_HEALING_ROLLBACK_BLOCKED');
  assert.equal(calls.rollback, 0);

  const approved = await service.rollback({
    incident_id: 'incident-rb',
    restore_ref: 'release:known-good',
    approval: {
      approved: true,
      action: 'ROLLBACK',
      incident_id: 'incident-rb',
    },
  });
  assert.equal(approved.status, 'SELF_HEALING_ROLLED_BACK');
  assert.equal(calls.rollback, 1);
});

test('GEN2-18 owner halt wins at inspection and before a prepared repair is applied', async () => {
  const { service, calls } = coordinator();

  const blockedInspection = await service.inspect({
    incident_id: 'incident-halt',
    owner_halt: true,
  });
  assert.equal(blockedInspection.status, 'SELF_HEALING_BLOCKED');
  assert.equal(blockedInspection.state.policy.reason, 'OWNER_HALT_ACTIVE');

  await service.inspect({ incident_id: 'incident-halt-2' });
  await service.prepareRepair({
    incident_id: 'incident-halt-2',
    repair_id: 'repair-halt',
    target: 'candidate',
    rollback_ref: 'sha:good',
  });
  const blockedApply = await service.applyPreparedRepair({
    incident_id: 'incident-halt-2',
    owner_halt: true,
  });
  assert.equal(blockedApply.status, 'SELF_HEALING_REPAIR_BLOCKED');
  assert.equal(blockedApply.state.policy.reason, 'OWNER_HALT_ACTIVE');
  assert.equal(calls.apply, 0);
});

test('GEN2-18 missing mutation adapters fail closed', async () => {
  const repository = new D1DevJobRepository(null);
  const service = createControlledSelfHealingCoordinator({
    repository,
    detect: async () => detection,
    diagnose: async () => ({ summary: 'diagnosed' }),
  });

  await service.inspect({ incident_id: 'incident-no-adapter' });
  await assert.rejects(
    () => service.prepareRepair({
      incident_id: 'incident-no-adapter',
      repair_id: 'repair-no-adapter',
      rollback_ref: 'sha:good',
    }),
    { code: 'SELF_HEALING_CANDIDATE_BUILDER_UNAVAILABLE', status: 503 },
  );
  await assert.rejects(
    () => service.rollback({
      incident_id: 'incident-no-adapter',
      restore_ref: 'sha:good',
      approval: { approved: true, action: 'ROLLBACK', incident_id: 'incident-no-adapter' },
    }),
    { code: 'SELF_HEALING_ROLLBACK_ADAPTER_UNAVAILABLE', status: 503 },
  );
});
