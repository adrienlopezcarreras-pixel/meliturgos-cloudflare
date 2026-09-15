export const SELF_HEALING_SCHEMA = 'mel.resilience.self-healing-policy.v1';

export const SELF_HEALING_ACTIONS = Object.freeze({
  OBSERVE: 'OBSERVE',
  APPLY_REPAIR: 'APPLY_REPAIR',
  ROLLBACK: 'ROLLBACK',
  DENY: 'DENY',
});

const VALID_TARGETS = new Set(['candidate', 'production']);

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function cleanEvidence(value) {
  if (!Array.isArray(value)) return [];
  return value.map(text).filter(Boolean).slice(0, 32);
}

function approvalMatches(approval, { action, incidentId, repairId = '' }) {
  if (!approval || approval.approved !== true) return false;
  if (text(approval.action).toUpperCase() !== action) return false;
  if (text(approval.incident_id) !== incidentId) return false;
  if (repairId && text(approval.repair_id) !== repairId) return false;
  return true;
}

export function normalizeSelfHealingRequest(input = {}) {
  const incident = input.incident || {};
  const repair = input.repair || {};
  const rollback = input.rollback || {};
  const target = VALID_TARGETS.has(repair.target) ? repair.target : 'candidate';

  return {
    schema: SELF_HEALING_SCHEMA,
    owner_halt: input.owner_halt === true,
    incident: {
      id: text(incident.id),
      detected: incident.detected === true,
      severity: text(incident.severity).toLowerCase() || 'unknown',
      evidence: cleanEvidence(incident.evidence),
    },
    repair: {
      requested: repair.requested === true,
      id: text(repair.id),
      target,
      tested: repair.tested === true,
      tests_passed: repair.tests_passed === true,
      reversible: repair.reversible === true,
      rollback_ref: text(repair.rollback_ref),
    },
    rollback: {
      requested: rollback.requested === true,
      restore_ref: text(rollback.restore_ref),
    },
    approval: input.approval || null,
  };
}

/**
 * GEN2-18 policy gate.
 *
 * Invariants:
 * - detection with evidence comes before every healing action;
 * - repairs must be tested and reversible before they can be applied;
 * - production repairs require exact scoped approval;
 * - rollback always requires exact scoped approval;
 * - owner halt always wins;
 * - ambiguous requests fail closed.
 */
export function evaluateSelfHealingPolicy(input = {}) {
  const request = normalizeSelfHealingRequest(input);
  const { incident, repair, rollback, approval } = request;

  if (request.owner_halt) {
    return decision(request, SELF_HEALING_ACTIONS.DENY, 'OWNER_HALT_ACTIVE');
  }

  if (!incident.detected || !incident.id || incident.evidence.length === 0) {
    return decision(request, SELF_HEALING_ACTIONS.DENY, 'DETECTION_EVIDENCE_REQUIRED');
  }

  if (rollback.requested && repair.requested) {
    return decision(request, SELF_HEALING_ACTIONS.DENY, 'AMBIGUOUS_HEALING_ACTION');
  }

  if (rollback.requested) {
    if (!rollback.restore_ref) {
      return decision(request, SELF_HEALING_ACTIONS.DENY, 'ROLLBACK_RESTORE_REF_REQUIRED');
    }
    if (!approvalMatches(approval, { action: 'ROLLBACK', incidentId: incident.id })) {
      return decision(request, SELF_HEALING_ACTIONS.DENY, 'ROLLBACK_APPROVAL_REQUIRED');
    }
    return decision(request, SELF_HEALING_ACTIONS.ROLLBACK, 'APPROVED_ROLLBACK');
  }

  if (!repair.requested) {
    return decision(request, SELF_HEALING_ACTIONS.OBSERVE, 'DETECTED_NO_CHANGE_REQUESTED');
  }

  if (!repair.id) {
    return decision(request, SELF_HEALING_ACTIONS.DENY, 'REPAIR_ID_REQUIRED');
  }

  if (!repair.tested || !repair.tests_passed) {
    return decision(request, SELF_HEALING_ACTIONS.DENY, 'TESTED_REPAIR_REQUIRED');
  }

  if (!repair.reversible || !repair.rollback_ref) {
    return decision(request, SELF_HEALING_ACTIONS.DENY, 'REVERSIBLE_REPAIR_REQUIRED');
  }

  if (repair.target === 'production' && !approvalMatches(approval, {
    action: 'REPAIR',
    incidentId: incident.id,
    repairId: repair.id,
  })) {
    return decision(request, SELF_HEALING_ACTIONS.DENY, 'PRODUCTION_REPAIR_APPROVAL_REQUIRED');
  }

  return decision(
    request,
    SELF_HEALING_ACTIONS.APPLY_REPAIR,
    repair.target === 'production' ? 'APPROVED_TESTED_PRODUCTION_REPAIR' : 'TESTED_CANDIDATE_REPAIR',
  );
}

export function createSelfHealingPlan(input = {}) {
  const result = evaluateSelfHealingPolicy(input);
  return {
    schema: SELF_HEALING_SCHEMA,
    allowed: result.allowed,
    action: result.action,
    reason: result.reason,
    incident_id: result.request.incident.id || null,
    repair_id: result.request.repair.id || null,
    target: result.request.repair.target,
    rollback_ref: result.request.rollback.requested
      ? result.request.rollback.restore_ref || null
      : result.request.repair.rollback_ref || null,
    constraints: Object.freeze([
      'OWNER_HALT_ALWAYS_WINS',
      'DETECTION_WITH_EVIDENCE_REQUIRED',
      'REPAIR_MUST_BE_TESTED_AND_REVERSIBLE',
      'ROLLBACK_REQUIRES_EXPLICIT_APPROVAL',
      'PRODUCTION_REPAIR_REQUIRES_EXPLICIT_APPROVAL',
    ]),
  };
}

function decision(request, action, reason) {
  return {
    schema: SELF_HEALING_SCHEMA,
    allowed: action !== SELF_HEALING_ACTIONS.DENY,
    action,
    reason,
    request,
  };
}
