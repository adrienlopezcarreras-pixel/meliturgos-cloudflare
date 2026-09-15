import test from 'node:test';
import assert from 'node:assert/strict';

import {
  SELF_HEALING_ACTIONS,
  SELF_HEALING_SCHEMA,
  createSelfHealingPlan,
  evaluateSelfHealingPolicy,
  normalizeSelfHealingRequest,
} from '../../src/resilience/self-healing-policy.js';

const incident = {
  id: 'incident-42',
  detected: true,
  severity: 'high',
  evidence: ['failing smoke test', 'integrity mismatch'],
};

test('GEN2-18 fails closed without detected evidence', () => {
  const result = evaluateSelfHealingPolicy({
    incident: { id: 'incident-42', detected: true, evidence: [] },
    repair: { requested: true, id: 'repair-1', tested: true, tests_passed: true, reversible: true, rollback_ref: 'sha:good' },
  });

  assert.equal(result.allowed, false);
  assert.equal(result.action, SELF_HEALING_ACTIONS.DENY);
  assert.equal(result.reason, 'DETECTION_EVIDENCE_REQUIRED');
});

test('GEN2-18 allows observation after detection but performs no mutation', () => {
  const result = evaluateSelfHealingPolicy({ incident });
  assert.equal(result.allowed, true);
  assert.equal(result.action, SELF_HEALING_ACTIONS.OBSERVE);
  assert.equal(result.reason, 'DETECTED_NO_CHANGE_REQUESTED');
});

test('GEN2-18 only allows a candidate repair after tests pass and rollback is defined', () => {
  const blockedUntested = evaluateSelfHealingPolicy({
    incident,
    repair: {
      requested: true,
      id: 'repair-1',
      target: 'candidate',
      reversible: true,
      rollback_ref: 'sha:good',
    },
  });
  assert.equal(blockedUntested.allowed, false);
  assert.equal(blockedUntested.reason, 'TESTED_REPAIR_REQUIRED');

  const allowed = evaluateSelfHealingPolicy({
    incident,
    repair: {
      requested: true,
      id: 'repair-1',
      target: 'candidate',
      tested: true,
      tests_passed: true,
      reversible: true,
      rollback_ref: 'sha:good',
    },
  });
  assert.equal(allowed.allowed, true);
  assert.equal(allowed.action, SELF_HEALING_ACTIONS.APPLY_REPAIR);
  assert.equal(allowed.reason, 'TESTED_CANDIDATE_REPAIR');
});

test('GEN2-18 requires exact scoped approval before a production repair', () => {
  const repair = {
    requested: true,
    id: 'repair-prod-1',
    target: 'production',
    tested: true,
    tests_passed: true,
    reversible: true,
    rollback_ref: 'release:last-known-good',
  };

  const blocked = evaluateSelfHealingPolicy({ incident, repair });
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.reason, 'PRODUCTION_REPAIR_APPROVAL_REQUIRED');

  const wrongScope = evaluateSelfHealingPolicy({
    incident,
    repair,
    approval: { approved: true, action: 'REPAIR', incident_id: incident.id, repair_id: 'other-repair' },
  });
  assert.equal(wrongScope.allowed, false);

  const approved = evaluateSelfHealingPolicy({
    incident,
    repair,
    approval: { approved: true, action: 'REPAIR', incident_id: incident.id, repair_id: repair.id },
  });
  assert.equal(approved.allowed, true);
  assert.equal(approved.action, SELF_HEALING_ACTIONS.APPLY_REPAIR);
  assert.equal(approved.reason, 'APPROVED_TESTED_PRODUCTION_REPAIR');
});

test('GEN2-18 rollback always requires explicit incident-scoped approval', () => {
  const rollback = { requested: true, restore_ref: 'release:last-known-good' };
  const blocked = evaluateSelfHealingPolicy({ incident, rollback });
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.reason, 'ROLLBACK_APPROVAL_REQUIRED');

  const approved = evaluateSelfHealingPolicy({
    incident,
    rollback,
    approval: { approved: true, action: 'ROLLBACK', incident_id: incident.id },
  });
  assert.equal(approved.allowed, true);
  assert.equal(approved.action, SELF_HEALING_ACTIONS.ROLLBACK);
  assert.equal(approved.reason, 'APPROVED_ROLLBACK');
});

test('GEN2-18 owner halt wins over repair and rollback approval', () => {
  const result = evaluateSelfHealingPolicy({
    owner_halt: true,
    incident,
    rollback: { requested: true, restore_ref: 'release:last-known-good' },
    approval: { approved: true, action: 'ROLLBACK', incident_id: incident.id },
  });
  assert.equal(result.allowed, false);
  assert.equal(result.reason, 'OWNER_HALT_ACTIVE');
});

test('GEN2-18 denies ambiguous simultaneous repair and rollback', () => {
  const result = evaluateSelfHealingPolicy({
    incident,
    repair: { requested: true, id: 'repair-1', tested: true, tests_passed: true, reversible: true, rollback_ref: 'sha:good' },
    rollback: { requested: true, restore_ref: 'sha:good' },
  });
  assert.equal(result.allowed, false);
  assert.equal(result.reason, 'AMBIGUOUS_HEALING_ACTION');
});

test('GEN2-18 normalizes untrusted fields and exposes a deterministic constrained plan', () => {
  const normalized = normalizeSelfHealingRequest({
    incident: { id: '  incident-42  ', detected: true, severity: ' HIGH ', evidence: [' proof ', '', 12] },
    repair: { target: 'unknown-target' },
  });
  assert.equal(normalized.schema, SELF_HEALING_SCHEMA);
  assert.equal(normalized.incident.id, 'incident-42');
  assert.equal(normalized.incident.severity, 'high');
  assert.deepEqual(normalized.incident.evidence, ['proof']);
  assert.equal(normalized.repair.target, 'candidate');

  const plan = createSelfHealingPlan({ incident });
  assert.equal(plan.schema, SELF_HEALING_SCHEMA);
  assert.equal(plan.action, SELF_HEALING_ACTIONS.OBSERVE);
  assert.ok(plan.constraints.includes('OWNER_HALT_ALWAYS_WINS'));
  assert.ok(plan.constraints.includes('ROLLBACK_REQUIRES_EXPLICIT_APPROVAL'));
});
