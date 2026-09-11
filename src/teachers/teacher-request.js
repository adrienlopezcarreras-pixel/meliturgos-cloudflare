import { UNIFIED_DEVELOPMENT_POLICY } from '../evolution/unified-development-policy.js';

const MAX_TEXT = 12000;
const SECRET_LIKE = /(?:api[_ -]?key|password|mot\s+de\s+passe|bearer\s+[a-z0-9._-]+|\btoken\b|\botp\b|secret\s*[=:])/i;

function bounded(value, max = MAX_TEXT) {
  const text = String(value ?? '').trim();
  return text.length > max ? `${text.slice(0, max)}\n[TRUNCATED]` : text;
}

function safeValue(value, depth = 0) {
  if (depth > 5) return '[DEPTH_LIMIT]';
  if (value == null || typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'string') return SECRET_LIKE.test(value) ? '[REDACTED_SECRET_LIKE]' : bounded(value);
  if (Array.isArray(value)) return value.slice(0, 50).map(v => safeValue(v, depth + 1));
  if (typeof value === 'object') {
    const out = {};
    for (const [key, item] of Object.entries(value).slice(0, 80)) {
      if (/secret|password|token|authorization|cookie|otp/i.test(key)) out[key] = '[REDACTED]';
      else out[key] = safeValue(item, depth + 1);
    }
    return out;
  }
  return bounded(value);
}

function requiredObject(value, code) {
  if (!value || typeof value !== 'object') throw Object.assign(new Error(code), { code });
  return value;
}

export function createTeacherReviewRequest({
  goal,
  council,
  inspection,
  spec,
  candidate = null,
  patchSummary = null,
  tests = [],
  security = null,
  unknowns = [],
  rollback = null,
  provenance = {},
} = {}) {
  const objective = bounded(goal, 4000);
  if (!objective) throw Object.assign(new Error('TEACHER_GOAL_REQUIRED'), { code: 'TEACHER_GOAL_REQUIRED' });
  const councilData = requiredObject(council, 'TEACHER_COUNCIL_REQUIRED');
  const inspectionData = requiredObject(inspection, 'TEACHER_INSPECTION_REQUIRED');
  if (inspectionData.status !== 'COMPLETE' || !Array.isArray(inspectionData.evidence) || inspectionData.evidence.length === 0) {
    throw Object.assign(new Error('TEACHER_INSPECTION_INCOMPLETE'), { code: 'TEACHER_INSPECTION_INCOMPLETE' });
  }
  const requestId = crypto.randomUUID();
  return {
    type: 'MEL_TEACHER_REVIEW_REQUEST',
    version: 2,
    request_id: requestId,
    created_at: new Date().toISOString(),
    objective,
    stage: 'TEACHER_REVIEW_REQUIRED',
    governance: {
      mode: UNIFIED_DEVELOPMENT_POLICY.mode,
      consensus_mode: UNIFIED_DEVELOPMENT_POLICY.consensus_mode,
      consensus_required_before_persistence: true,
      final_authority: UNIFIED_DEVELOPMENT_POLICY.final_authority,
      final_authority_temporary: true,
      parallel_implementations_allowed: false,
      persistent_implementation_plans: 1,
      decision_rule: 'COUNCIL_SEEKS_AGREEMENT; MEL_SYNTHESIZES; CHATGPT_TEACHER_ARBITRATES_REMAINING_DISAGREEMENT; ONE_CANONICAL_PLAN_ONLY',
    },
    council: safeValue(councilData),
    inspection: safeValue(inspectionData),
    spec: safeValue(spec || {}),
    candidate: safeValue(candidate),
    patch_summary: safeValue(patchSummary),
    tests: safeValue(tests),
    security: safeValue(security),
    unknowns: safeValue(unknowns),
    rollback: safeValue(rollback),
    provenance: safeValue({ ...provenance, producer: 'MEL', contract: 'teacher-review/v2' }),
    requested_review: [
      'council_consensus_and_disagreements',
      'single_canonical_decision',
      'architecture',
      'correctness',
      'security_privacy',
      'test_coverage',
      'reuse_vs_rebuild',
      'rollback_and_unknowns',
    ],
  };
}

export function applyTeacherReview(request, review = {}) {
  if (!request || request.type !== 'MEL_TEACHER_REVIEW_REQUEST') {
    throw Object.assign(new Error('TEACHER_REQUEST_REQUIRED'), { code: 'TEACHER_REQUEST_REQUIRED' });
  }
  if (String(review.request_id || '') !== request.request_id) {
    throw Object.assign(new Error('TEACHER_REVIEW_REQUEST_MISMATCH'), { code: 'TEACHER_REVIEW_REQUEST_MISMATCH' });
  }
  const verdict = String(review.verdict || '').toUpperCase();
  const allowed = new Set(['APPROVE_PLAN', 'NEEDS_CHANGES', 'REJECT']);
  if (!allowed.has(verdict)) throw Object.assign(new Error('TEACHER_VERDICT_INVALID'), { code: 'TEACHER_VERDICT_INVALID' });
  return {
    ok: true,
    request_id: request.request_id,
    verdict,
    development_allowed: verdict === 'APPROVE_PLAN',
    final_authority: 'CHATGPT_TEACHER',
    final_decision: true,
    canonical_plan_count_allowed: 1,
    parallel_implementations_allowed: false,
    feedback: safeValue(review.feedback || ''),
    evidence: safeValue(review.evidence || []),
    provenance: safeValue(review.provenance || { teacher: 'CHATGPT_TEACHER' }),
    reviewed_at: new Date().toISOString(),
  };
}
