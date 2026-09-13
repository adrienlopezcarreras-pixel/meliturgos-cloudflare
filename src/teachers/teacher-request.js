const MAX_TEXT = 12000;
const SECRET_LIKE = /(?:api[_ -]?key|password|mot\s+de\s+passe|bearer\s+[a-z0-9._-]+|\btoken\b|\botp\b|secret\s*[=:])/i;
const EXACT_GIT_SHA = /^[a-f0-9]{40}$/i;
const REQUIRED_COUNCIL_ROLE_IDS = Object.freeze([
  'ARCHITECTURE_REUSE',
  'SECURITY_GOVERNANCE',
  'TESTS_EVIDENCE',
  'PRODUCT_INTEGRATION',
]);

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

function requireExactSha(value, code = 'TEACHER_TARGET_SHA_REQUIRED') {
  const sha = String(value || '').trim().toLowerCase();
  if (!EXACT_GIT_SHA.test(sha)) throw Object.assign(new Error(code), { code });
  return sha;
}

function validateCouncilForTeacher(council) {
  if (council.status !== 'COMPLETE' || council.phase !== 'STATE_OF_PLAY_BEFORE_DEVELOPMENT') {
    throw Object.assign(new Error('TEACHER_COUNCIL_INCOMPLETE'), { code: 'TEACHER_COUNCIL_INCOMPLETE' });
  }
  if (council.all_required_roles_satisfied !== true) {
    throw Object.assign(new Error('TEACHER_COUNCIL_REQUIRED_ROLES_MISSING'), { code: 'TEACHER_COUNCIL_REQUIRED_ROLES_MISSING' });
  }
  const succeeded = new Set(Array.isArray(council.required_roles_succeeded) ? council.required_roles_succeeded : []);
  const missing = REQUIRED_COUNCIL_ROLE_IDS.filter(role => !succeeded.has(role));
  if (missing.length) {
    const error = Object.assign(new Error('TEACHER_COUNCIL_REQUIRED_ROLES_MISSING'), { code: 'TEACHER_COUNCIL_REQUIRED_ROLES_MISSING' });
    error.missing_roles = missing;
    throw error;
  }
  if (council.synthesis?.status !== 'COMPLETE' || !bounded(council.synthesis?.text, MAX_TEXT)) {
    throw Object.assign(new Error('TEACHER_COUNCIL_SYNTHESIS_REQUIRED'), { code: 'TEACHER_COUNCIL_SYNTHESIS_REQUIRED' });
  }
  if (council.teacher_required !== true || council.development_allowed !== false) {
    throw Object.assign(new Error('TEACHER_COUNCIL_GATE_INVALID'), { code: 'TEACHER_COUNCIL_GATE_INVALID' });
  }
  return council;
}

function resolveTargetSha({ council, candidate, provenance }) {
  const values = [
    council?.context?.target_sha,
    candidate?.sha,
    provenance?.target_sha,
    provenance?.git_sha,
  ].filter(value => value != null && String(value).trim());
  if (!values.length) return requireExactSha('', 'TEACHER_TARGET_SHA_REQUIRED');
  const normalized = values.map(value => requireExactSha(value));
  if (new Set(normalized).size !== 1) {
    throw Object.assign(new Error('TEACHER_TARGET_SHA_MISMATCH'), { code: 'TEACHER_TARGET_SHA_MISMATCH' });
  }
  return normalized[0];
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
  const councilData = validateCouncilForTeacher(requiredObject(council, 'TEACHER_COUNCIL_REQUIRED'));
  const inspectionData = requiredObject(inspection, 'TEACHER_INSPECTION_REQUIRED');
  if (inspectionData.status !== 'COMPLETE' || !Array.isArray(inspectionData.evidence) || inspectionData.evidence.length === 0) {
    throw Object.assign(new Error('TEACHER_INSPECTION_INCOMPLETE'), { code: 'TEACHER_INSPECTION_INCOMPLETE' });
  }
  const targetSha = resolveTargetSha({ council: councilData, candidate, provenance });
  const requestId = crypto.randomUUID();
  return {
    type: 'MEL_TEACHER_REVIEW_REQUEST',
    version: 2,
    request_id: requestId,
    created_at: new Date().toISOString(),
    objective,
    stage: 'TEACHER_REVIEW_REQUIRED',
    target_sha: targetSha,
    council: safeValue(councilData),
    inspection: safeValue(inspectionData),
    spec: safeValue(spec || {}),
    candidate: safeValue(candidate),
    patch_summary: safeValue(patchSummary),
    tests: safeValue(tests),
    security: safeValue(security),
    unknowns: safeValue(unknowns),
    rollback: safeValue(rollback),
    provenance: safeValue({ ...provenance, target_sha: targetSha, producer: 'MEL', contract: 'teacher-review/v2' }),
    requested_review: [
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
  const requestSha = requireExactSha(request.target_sha, 'TEACHER_REQUEST_TARGET_SHA_INVALID');
  const reviewSha = requireExactSha(review.target_sha, 'TEACHER_REVIEW_TARGET_SHA_REQUIRED');
  if (reviewSha !== requestSha) {
    throw Object.assign(new Error('TEACHER_REVIEW_TARGET_SHA_MISMATCH'), { code: 'TEACHER_REVIEW_TARGET_SHA_MISMATCH' });
  }
  const verdict = String(review.verdict || '').toUpperCase();
  const allowed = new Set(['APPROVE_PLAN', 'NEEDS_CHANGES', 'REJECT']);
  if (!allowed.has(verdict)) throw Object.assign(new Error('TEACHER_VERDICT_INVALID'), { code: 'TEACHER_VERDICT_INVALID' });
  return {
    ok: true,
    request_id: request.request_id,
    target_sha: requestSha,
    verdict,
    development_allowed: verdict === 'APPROVE_PLAN',
    feedback: safeValue(review.feedback || ''),
    evidence: safeValue(review.evidence || []),
    provenance: safeValue({ ...(review.provenance || { teacher: 'external-teacher' }), target_sha: requestSha }),
    reviewed_at: new Date().toISOString(),
  };
}
