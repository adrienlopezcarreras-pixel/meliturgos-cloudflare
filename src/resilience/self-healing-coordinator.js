import { DomainError, requireValue } from '../core/contracts.js';
import {
  SELF_HEALING_ACTIONS,
  SELF_HEALING_SCHEMA,
  evaluateSelfHealingPolicy,
} from './self-healing-policy.js';

export const SELF_HEALING_JOB_PREFIX = 'mel-self-healing:';

const isRecord = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const clone = value => value == null ? value : structuredClone(value);

function asText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function requireIncidentId(value) {
  const id = asText(value);
  requireValue(id.length > 0 && id.length <= 120, 'SELF_HEALING_INCIDENT_ID_REQUIRED', 400);
  return id;
}

function requireRepairId(value) {
  const id = asText(value);
  requireValue(id.length > 0 && id.length <= 120, 'SELF_HEALING_REPAIR_ID_REQUIRED', 400);
  return id;
}

function normalizeEvidence(value) {
  requireValue(Array.isArray(value), 'SELF_HEALING_DETECTION_EVIDENCE_INVALID', 500);
  return value
    .filter(item => typeof item === 'string')
    .map(item => item.trim())
    .filter(Boolean)
    .slice(0, 32);
}

function normalizeDetection(incidentId, value) {
  requireValue(isRecord(value), 'SELF_HEALING_DETECTION_INVALID', 500);
  const detected = value.detected === true;
  const evidence = normalizeEvidence(value.evidence || []);
  return Object.freeze({
    id: incidentId,
    detected,
    severity: asText(value.severity).toLowerCase() || 'unknown',
    evidence: Object.freeze(evidence),
  });
}

function normalizeDiagnosis(value) {
  requireValue(isRecord(value), 'SELF_HEALING_DIAGNOSIS_INVALID', 500);
  const summary = asText(value.summary);
  requireValue(summary, 'SELF_HEALING_DIAGNOSIS_SUMMARY_REQUIRED', 500);
  const suspectedCauses = Array.isArray(value.suspected_causes)
    ? value.suspected_causes.map(asText).filter(Boolean).slice(0, 24)
    : [];
  return Object.freeze({
    summary,
    suspected_causes: Object.freeze(suspectedCauses),
    evidence: Object.freeze(
      Array.isArray(value.evidence)
        ? value.evidence.map(asText).filter(Boolean).slice(0, 32)
        : [],
    ),
  });
}

function normalizeCandidate(value) {
  requireValue(isRecord(value), 'SELF_HEALING_CANDIDATE_INVALID', 500);
  const ref = asText(value.candidate_ref || value.ref || value.sha);
  requireValue(ref, 'SELF_HEALING_CANDIDATE_REF_REQUIRED', 500);
  return Object.freeze({
    ...clone(value),
    candidate_ref: ref,
  });
}

function normalizeTestResult(value) {
  requireValue(isRecord(value), 'SELF_HEALING_TEST_RESULT_INVALID', 500);
  const tests = Array.isArray(value.tests)
    ? value.tests.slice(0, 100).map((row, index) => {
        requireValue(isRecord(row), 'SELF_HEALING_TEST_ROW_INVALID', 500);
        return Object.freeze({
          name: asText(row.name) || `test-${index + 1}`,
          passed: row.passed === true,
          evidence: asText(row.evidence || row.detail),
        });
      })
    : [];
  const passed = value.passed === true && tests.every(row => row.passed);
  return Object.freeze({
    passed,
    tests: Object.freeze(tests),
    evidence: Object.freeze(
      Array.isArray(value.evidence)
        ? value.evidence.map(asText).filter(Boolean).slice(0, 32)
        : [],
    ),
  });
}

function jobIdForIncident(incidentId) {
  return `${SELF_HEALING_JOB_PREFIX}${incidentId}`;
}

function stateFromJob(job) {
  const state = job?.result_json?.self_healing;
  requireValue(isRecord(state), 'SELF_HEALING_STATE_NOT_FOUND', 404);
  return clone(state);
}

function appendHistory(state, entry) {
  const history = Array.isArray(state.history) ? [...state.history] : [];
  history.push(Object.freeze({
    at: Date.now(),
    ...clone(entry),
  }));
  return history.slice(-100);
}

export class ControlledSelfHealingCoordinator {
  constructor({
    repository,
    detect,
    diagnose,
    buildCandidate = null,
    testCandidate = null,
    applyRepair = null,
    rollback = null,
  } = {}) {
    requireValue(
      repository
        && typeof repository.createIfAbsent === 'function'
        && typeof repository.get === 'function'
        && typeof repository.update === 'function',
      'SELF_HEALING_REPOSITORY_REQUIRED',
      500,
    );
    requireValue(typeof detect === 'function', 'SELF_HEALING_DETECTOR_REQUIRED', 500);
    requireValue(typeof diagnose === 'function', 'SELF_HEALING_DIAGNOSTIC_REQUIRED', 500);
    this.repository = repository;
    this.detect = detect;
    this.diagnose = diagnose;
    this.buildCandidate = buildCandidate;
    this.testCandidate = testCandidate;
    this.applyRepair = applyRepair;
    this.rollbackAdapter = rollback;
  }

  async inspect(input = {}, context = {}) {
    const incidentId = requireIncidentId(input.incident_id || input.incidentId);
    const detection = normalizeDetection(
      incidentId,
      await this.detect({ incident_id: incidentId, signal: clone(input.signal || {}) }, context),
    );

    if (!detection.detected) {
      return Object.freeze({
        schema: SELF_HEALING_SCHEMA,
        status: 'NO_INCIDENT',
        incident: detection,
        mutation_allowed: false,
      });
    }

    const created = await this.repository.createIfAbsent({
      id: jobIdForIncident(incidentId),
      requested_by: 'self-healing',
      goal: `Diagnose and safely recover incident ${incidentId}`,
      optional_context: {
        kind: 'self_healing',
        incident_id: incidentId,
      },
    });
    const job = created.job;
    const policy = evaluateSelfHealingPolicy({
      owner_halt: input.owner_halt === true,
      incident: detection,
    });

    if (!policy.allowed || policy.action !== SELF_HEALING_ACTIONS.OBSERVE) {
      const state = {
        schema: SELF_HEALING_SCHEMA,
        incident: detection,
        diagnosis: null,
        prepared_request: null,
        candidate: null,
        tests: null,
        policy,
        history: appendHistory({}, { phase: 'DETECTION', action: policy.action, reason: policy.reason }),
      };
      const saved = await this.repository.update(job.id, {
        status: 'SELF_HEALING_BLOCKED',
        plan_json: policy,
        result_json: { ...(job.result_json || {}), self_healing: state },
        error: policy.reason,
      });
      return Object.freeze({ status: saved.status, job: saved, state });
    }

    const diagnosis = normalizeDiagnosis(
      await this.diagnose({ incident: clone(detection), signal: clone(input.signal || {}) }, context),
    );
    const state = {
      schema: SELF_HEALING_SCHEMA,
      incident: detection,
      diagnosis,
      prepared_request: null,
      candidate: null,
      tests: null,
      policy,
      history: appendHistory({}, { phase: 'DIAGNOSIS', action: 'OBSERVE', reason: policy.reason }),
    };
    const saved = await this.repository.update(job.id, {
      status: 'SELF_HEALING_DIAGNOSED',
      plan_json: {
        incident: detection,
        diagnosis,
        mutation_allowed: false,
      },
      result_json: { ...(job.result_json || {}), self_healing: state },
      error: null,
    });
    return Object.freeze({ status: saved.status, job: saved, state });
  }

  async prepareRepair(input = {}, context = {}) {
    requireValue(typeof this.buildCandidate === 'function', 'SELF_HEALING_CANDIDATE_BUILDER_UNAVAILABLE', 503);
    requireValue(typeof this.testCandidate === 'function', 'SELF_HEALING_TESTER_UNAVAILABLE', 503);

    const incidentId = requireIncidentId(input.incident_id || input.incidentId);
    const repairId = requireRepairId(input.repair_id || input.repairId);
    const job = await this.repository.get(jobIdForIncident(incidentId));
    requireValue(job, 'SELF_HEALING_JOB_NOT_FOUND', 404);
    const previous = stateFromJob(job);
    requireValue(previous.incident?.detected === true, 'SELF_HEALING_INCIDENT_NOT_DETECTED', 409);
    requireValue(previous.diagnosis, 'SELF_HEALING_DIAGNOSIS_REQUIRED', 409);

    const candidate = normalizeCandidate(await this.buildCandidate({
      incident: clone(previous.incident),
      diagnosis: clone(previous.diagnosis),
      repair_id: repairId,
      target: input.target || 'candidate',
    }, context));

    const tests = normalizeTestResult(await this.testCandidate({
      incident: clone(previous.incident),
      diagnosis: clone(previous.diagnosis),
      candidate: clone(candidate),
      repair_id: repairId,
    }, context));

    const preparedRequest = {
      owner_halt: input.owner_halt === true,
      incident: clone(previous.incident),
      repair: {
        requested: true,
        id: repairId,
        target: input.target || 'candidate',
        tested: true,
        tests_passed: tests.passed,
        reversible: Boolean(asText(input.rollback_ref || input.rollbackRef)),
        rollback_ref: asText(input.rollback_ref || input.rollbackRef),
      },
      approval: input.approval || null,
    };
    const policy = evaluateSelfHealingPolicy(preparedRequest);
    const ready = policy.allowed && policy.action === SELF_HEALING_ACTIONS.APPLY_REPAIR;
    const state = {
      ...previous,
      prepared_request: preparedRequest,
      candidate,
      tests,
      policy,
      history: appendHistory(previous, {
        phase: 'PREPARE_REPAIR',
        action: policy.action,
        reason: policy.reason,
        repair_id: repairId,
      }),
    };
    const saved = await this.repository.update(job.id, {
      status: ready ? 'SELF_HEALING_REPAIR_READY' : 'SELF_HEALING_REPAIR_BLOCKED',
      plan_json: {
        incident: state.incident,
        diagnosis: state.diagnosis,
        repair: preparedRequest.repair,
        candidate_ref: candidate.candidate_ref,
        policy,
      },
      tests_json: tests.tests,
      result_json: { ...(job.result_json || {}), self_healing: state },
      candidate_branch: candidate.branch || candidate.candidate_branch || null,
      approval_status: ready ? 'POLICY_ALLOWED' : 'PENDING',
      error: ready ? null : policy.reason,
    });
    return Object.freeze({ status: saved.status, job: saved, state });
  }

  async applyPreparedRepair(input = {}, context = {}) {
    requireValue(typeof this.applyRepair === 'function', 'SELF_HEALING_APPLY_ADAPTER_UNAVAILABLE', 503);
    const incidentId = requireIncidentId(input.incident_id || input.incidentId);
    const job = await this.repository.get(jobIdForIncident(incidentId));
    requireValue(job, 'SELF_HEALING_JOB_NOT_FOUND', 404);
    const previous = stateFromJob(job);
    requireValue(previous.prepared_request && previous.candidate && previous.tests, 'SELF_HEALING_REPAIR_NOT_PREPARED', 409);

    const request = {
      ...clone(previous.prepared_request),
      owner_halt: input.owner_halt === true || previous.prepared_request.owner_halt === true,
      approval: input.approval ?? previous.prepared_request.approval ?? null,
    };
    const policy = evaluateSelfHealingPolicy(request);
    if (!policy.allowed || policy.action !== SELF_HEALING_ACTIONS.APPLY_REPAIR) {
      const state = {
        ...previous,
        policy,
        history: appendHistory(previous, { phase: 'APPLY_REPAIR', action: policy.action, reason: policy.reason }),
      };
      const saved = await this.repository.update(job.id, {
        status: 'SELF_HEALING_REPAIR_BLOCKED',
        result_json: { ...(job.result_json || {}), self_healing: state },
        approval_status: 'DENIED',
        error: policy.reason,
      });
      return Object.freeze({ status: saved.status, job: saved, state });
    }

    const result = await this.applyRepair({
      incident: clone(previous.incident),
      diagnosis: clone(previous.diagnosis),
      repair: clone(request.repair),
      candidate: clone(previous.candidate),
      tests: clone(previous.tests),
      policy: clone(policy),
    }, context);
    requireValue(isRecord(result), 'SELF_HEALING_APPLY_RESULT_INVALID', 500);

    const state = {
      ...previous,
      policy,
      applied: clone(result),
      history: appendHistory(previous, {
        phase: 'APPLY_REPAIR',
        action: policy.action,
        reason: policy.reason,
        target: request.repair.target,
      }),
    };
    const saved = await this.repository.update(job.id, {
      status: request.repair.target === 'production'
        ? 'SELF_HEALING_PRODUCTION_REPAIRED'
        : 'SELF_HEALING_CANDIDATE_REPAIRED',
      result_json: { ...(job.result_json || {}), self_healing: state },
      approval_status: request.repair.target === 'production' ? 'APPROVED' : 'POLICY_ALLOWED',
      error: null,
    });
    return Object.freeze({ status: saved.status, job: saved, state });
  }

  async rollback(input = {}, context = {}) {
    requireValue(typeof this.rollbackAdapter === 'function', 'SELF_HEALING_ROLLBACK_ADAPTER_UNAVAILABLE', 503);
    const incidentId = requireIncidentId(input.incident_id || input.incidentId);
    const restoreRef = asText(input.restore_ref || input.restoreRef);
    requireValue(restoreRef, 'SELF_HEALING_ROLLBACK_REF_REQUIRED', 400);
    const job = await this.repository.get(jobIdForIncident(incidentId));
    requireValue(job, 'SELF_HEALING_JOB_NOT_FOUND', 404);
    const previous = stateFromJob(job);

    const request = {
      owner_halt: input.owner_halt === true,
      incident: clone(previous.incident),
      rollback: {
        requested: true,
        restore_ref: restoreRef,
      },
      approval: input.approval || null,
    };
    const policy = evaluateSelfHealingPolicy(request);
    if (!policy.allowed || policy.action !== SELF_HEALING_ACTIONS.ROLLBACK) {
      const state = {
        ...previous,
        policy,
        history: appendHistory(previous, { phase: 'ROLLBACK', action: policy.action, reason: policy.reason }),
      };
      const saved = await this.repository.update(job.id, {
        status: 'SELF_HEALING_ROLLBACK_BLOCKED',
        result_json: { ...(job.result_json || {}), self_healing: state },
        approval_status: 'DENIED',
        error: policy.reason,
      });
      return Object.freeze({ status: saved.status, job: saved, state });
    }

    const result = await this.rollbackAdapter({
      incident: clone(previous.incident),
      restore_ref: restoreRef,
      policy: clone(policy),
    }, context);
    requireValue(isRecord(result), 'SELF_HEALING_ROLLBACK_RESULT_INVALID', 500);

    const state = {
      ...previous,
      policy,
      rollback: clone(result),
      history: appendHistory(previous, { phase: 'ROLLBACK', action: policy.action, reason: policy.reason }),
    };
    const saved = await this.repository.update(job.id, {
      status: 'SELF_HEALING_ROLLED_BACK',
      result_json: { ...(job.result_json || {}), self_healing: state },
      approval_status: 'APPROVED',
      error: null,
    });
    return Object.freeze({ status: saved.status, job: saved, state });
  }
}

export function createControlledSelfHealingCoordinator(options) {
  return new ControlledSelfHealingCoordinator(options);
}

export function selfHealingJobId(incidentId) {
  return jobIdForIncident(requireIncidentId(incidentId));
}

export function selfHealingDomainError(code, status = 500) {
  return new DomainError(code, status);
}
