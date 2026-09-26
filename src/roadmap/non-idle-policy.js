import { COMPLETION_MATRIX_SCHEMA, generateCompletionMatrix } from './completion-matrix.js';

export const NON_IDLE_POLICY_SCHEMA = 'mel.roadmap.non-idle-policy.v1';

function fail(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

function validateMatrix(matrix) {
  if (!matrix || matrix.schema !== COMPLETION_MATRIX_SCHEMA) fail('NON_IDLE_INVALID_MATRIX');
  if (!Array.isArray(matrix.next_work) || !Array.isArray(matrix.blockers)) fail('NON_IDLE_INVALID_MATRIX');
  if (!matrix.summary || typeof matrix.summary.actionable !== 'number' || typeof matrix.summary.blocked !== 'number') {
    fail('NON_IDLE_INVALID_MATRIX');
  }
  if (matrix.summary.actionable !== matrix.next_work.length) fail('NON_IDLE_ACTIONABLE_COUNT_MISMATCH');
  if (matrix.summary.blocked !== matrix.blockers.length) fail('NON_IDLE_BLOCKED_COUNT_MISMATCH');
  if (matrix.next_work.some(row => row.blocked || row.complete || !row.actionable)) {
    fail('NON_IDLE_ACTIONABLE_SET_INVALID');
  }
  return matrix;
}

/**
 * Deterministic continue-when-blocked policy.
 *
 * Human/external blockers are informative only while any actionable roadmap
 * item remains. They can never become the selected work item and can never
 * force IDLE. Selection order comes from the completion matrix, whose
 * next_work list is already canonical P0..P3 / phase / id ordered.
 */
export function getNonIdleDecision({ matrix = null } = {}) {
  const source = validateMatrix(matrix ?? generateCompletionMatrix());
  const next = source.next_work[0] || null;

  if (next) {
    return Object.freeze({
      ok: true,
      schema: NON_IDLE_POLICY_SCHEMA,
      decision: 'CONTINUE',
      idle: false,
      reason: 'ACTIONABLE_WORK_REMAINS',
      selected: Object.freeze({
        id: next.id,
        phase_id: next.phase_id,
        priority: next.priority,
        status: next.status,
        title: next.title,
        next: next.next || '',
      }),
      actionable_count: source.summary.actionable,
      blocked_count: source.summary.blocked,
      registry_revision: source.registry_revision,
      matrix_fingerprint: source.matrix_fingerprint,
    });
  }

  if (source.blockers.length > 0) {
    return Object.freeze({
      ok: true,
      schema: NON_IDLE_POLICY_SCHEMA,
      decision: 'WAIT_FOR_BLOCKERS',
      idle: true,
      reason: 'ONLY_BLOCKED_WORK_REMAINS',
      selected: null,
      actionable_count: 0,
      blocked_count: source.summary.blocked,
      registry_revision: source.registry_revision,
      matrix_fingerprint: source.matrix_fingerprint,
    });
  }

  return Object.freeze({
    ok: true,
    schema: NON_IDLE_POLICY_SCHEMA,
    decision: 'COMPLETE',
    idle: true,
    reason: 'ROADMAP_COMPLETE',
    selected: null,
    actionable_count: 0,
    blocked_count: 0,
    registry_revision: source.registry_revision,
    matrix_fingerprint: source.matrix_fingerprint,
  });
}

export function assertContinueWhenActionable({ matrix = null } = {}) {
  const decision = getNonIdleDecision({ matrix });
  if (decision.actionable_count > 0 && (decision.idle || decision.decision !== 'CONTINUE' || !decision.selected)) {
    fail('NON_IDLE_INVARIANT_BROKEN');
  }
  return decision;
}
