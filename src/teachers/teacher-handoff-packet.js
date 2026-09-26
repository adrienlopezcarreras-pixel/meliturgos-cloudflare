import { MULTI_AI_PROTOCOL } from '../coordination/multi-ai-protocol.js';
import { applyTeacherReview } from './teacher-request.js';

const EXACT_SHA = /^[0-9a-f]{40}$/i;
const SECRET_KEY = /(secret|token|password|authorization|cookie|api[_-]?key|otp|private[_-]?key|credential)/i;
const SECRET_VALUE = /(bearer\s+[a-z0-9._~+/=-]{8,}|\bsk-[a-z0-9_-]{8,}|\bgh[pousr]_[a-z0-9]{12,})/i;

function clean(value, depth = 0) {
  if (depth > 7) return '[DEPTH_LIMIT]';
  if (value == null || typeof value === 'boolean' || typeof value === 'number') return value;
  if (typeof value === 'string') return SECRET_VALUE.test(value)
    ? '[REDACTED_SECRET_LIKE]'
    : value.slice(0, 12_000);
  if (Array.isArray(value)) return value.slice(0, 100).map(item => clean(item, depth + 1));
  if (typeof value === 'object') {
    const out = {};
    for (const [key, item] of Object.entries(value).slice(0, 150)) {
      if (SECRET_KEY.test(key)) continue;
      out[key] = clean(item, depth + 1);
    }
    return out;
  }
  return String(value).slice(0, 12_000);
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
}

async function sha256(value) {
  const canonical = JSON.stringify(stable(value));
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

function requiredText(value, code) {
  const normalized = String(value ?? '').trim();
  if (!normalized) throw Object.assign(new Error(code), { code, status: 400 });
  return normalized;
}

function exactSha(value, code = 'TEACHER_HANDOFF_TARGET_SHA_INVALID') {
  const sha = requiredText(value, code).toLowerCase();
  if (!EXACT_SHA.test(sha)) throw Object.assign(new Error(code), { code, status: 400 });
  return sha;
}

function reviewRequest(request) {
  if (!request || request.type !== 'MEL_TEACHER_REVIEW_REQUEST' || !request.request_id) {
    throw Object.assign(new Error('TEACHER_HANDOFF_REQUEST_REQUIRED'), {
      code: 'TEACHER_HANDOFF_REQUEST_REQUIRED',
      status: 400,
    });
  }
  return request;
}

function councilSummary(council = {}) {
  const responses = Array.isArray(council.responses) ? council.responses : [];
  const roleRows = responses.map(row => {
    const answer = row?.answer || {};
    return clean({
      member: row?.member || null,
      role: answer.role || null,
      role_label: answer.role_label || null,
      provider_id: answer.provider_id || null,
      provider: answer.provenance?.provider || null,
      model: answer.provenance?.model || null,
      fallback_used: answer.provider_fallback_used === true,
    });
  });

  return clean({
    status: council.status || null,
    degraded: council.degraded === true,
    degraded_reason: council.degraded_reason || null,
    phase: council.phase || null,
    budget_policy: council.budget_policy || council.context?.budget_policy || null,
    required_roles: council.context?.required_roles || null,
    required_roles_succeeded: council.required_roles_succeeded || [],
    required_roles_missing: council.required_roles_missing || [],
    all_required_roles_satisfied: council.all_required_roles_satisfied === true,
    providers_attempted: council.providers_attempted || [],
    providers_succeeded: council.providers_succeeded || [],
    roles: roleRows,
    synthesis: council.synthesis ? {
      status: council.synthesis.status || null,
      coordinator: council.synthesis.coordinator || null,
      provider_id: council.synthesis.provider_id || null,
      provenance: council.synthesis.provenance || null,
      text: String(council.synthesis.text || '').slice(0, 12_000),
    } : null,
  });
}

function inspectionSummary(inspection = {}) {
  const evidence = Array.isArray(inspection.evidence) ? inspection.evidence : [];
  return clean({
    status: inspection.status || null,
    evidence_count: evidence.length,
    evidence: evidence.slice(0, 50),
  });
}

function normalizedTests(tests) {
  if (!Array.isArray(tests)) return [];
  return tests.slice(0, 100).map((row, index) => {
    if (typeof row === 'string') return { id: `test-${index + 1}`, name: row.slice(0, 500) };
    if (!row || typeof row !== 'object') return null;
    return clean({
      id: row.id || row.name || `test-${index + 1}`,
      name: row.name || null,
      status: row.status || null,
      passed: typeof row.passed === 'boolean' ? row.passed : null,
      run_id: row.run_id || row.ci_run_id || null,
      workflow: row.workflow || null,
      head_sha: row.head_sha || null,
      evidence: row.evidence || null,
    });
  }).filter(Boolean);
}

function protocolSnapshot() {
  return Object.freeze({
    repository: MULTI_AI_PROTOCOL.repository,
    canonical_candidate: MULTI_AI_PROTOCOL.canonicalCandidate,
    canonical_release: MULTI_AI_PROTOCOL.canonicalRelease,
    roadmap: MULTI_AI_PROTOCOL.roadmap,
    validation_rules: [...MULTI_AI_PROTOCOL.validationRules],
    release_rules: [...MULTI_AI_PROTOCOL.releaseRules],
    completion_rules: [...MULTI_AI_PROTOCOL.completionRules],
  });
}

function unsignedPacket(packet) {
  const copy = structuredClone(packet);
  delete copy.integrity;
  return copy;
}

/**
 * Creates one portable Teacher handoff bound to the exact request + Git SHA.
 * The packet intentionally contains evidence summaries and references, not
 * executable code or credentials.
 */
export async function createTeacherHandoffPacket({
  request,
  job = null,
  transport = 'runtime',
  additionalEvidence = {},
} = {}) {
  const source = reviewRequest(request);
  const targetSha = exactSha(source.target_sha);
  const candidateSha = source.candidate?.sha
    || source.candidate?.commit_sha
    || source.candidate?.candidate_sha
    || targetSha;
  if (exactSha(candidateSha, 'TEACHER_HANDOFF_CANDIDATE_SHA_INVALID') !== targetSha) {
    throw Object.assign(new Error('TEACHER_HANDOFF_CANDIDATE_SHA_MISMATCH'), {
      code: 'TEACHER_HANDOFF_CANDIDATE_SHA_MISMATCH',
      status: 409,
    });
  }

  const packet = {
    schema: 'mel.teacher-handoff/v1',
    packet_id: `teacher-handoff:${source.request_id}`,
    request_id: source.request_id,
    request_type: source.type,
    request_version: Number(source.version || 0),
    created_at: source.created_at || new Date().toISOString(),
    objective: String(source.objective || '').slice(0, 4000),
    stage: source.stage || 'TEACHER_REVIEW_REQUIRED',
    target: {
      repository: source.candidate?.repository || MULTI_AI_PROTOCOL.repository,
      branch: source.candidate?.branch || MULTI_AI_PROTOCOL.canonicalCandidate,
      sha: targetSha,
    },
    job: job ? clean({
      id: job.id || null,
      requested_by: job.requested_by || null,
      roadmap_id: job.optional_context?.roadmap_id || source.provenance?.roadmap_id || null,
      priority: job.optional_context?.priority || null,
      status: job.status || null,
    }) : null,
    council: councilSummary(source.council || {}),
    inspection: inspectionSummary(source.inspection || {}),
    spec: clean(source.spec || {}),
    candidate: clean(source.candidate || null),
    patch_summary: clean(source.patch_summary || null),
    tests: normalizedTests(source.tests),
    security: clean(source.security || null),
    unknowns: clean(source.unknowns || []),
    rollback: clean(source.rollback || null),
    requested_review: clean(source.requested_review || []),
    provenance: clean({
      ...(source.provenance || {}),
      target_sha: targetSha,
      handoff_producer: 'MEL',
      transport,
      contract: 'mel.teacher-handoff/v1',
    }),
    coordination: protocolSnapshot(),
    additional_evidence: clean(additionalEvidence),
    request: clean(source),
  };

  const digest = await sha256(packet);
  return Object.freeze({
    ...packet,
    integrity: Object.freeze({
      algorithm: 'SHA-256',
      digest,
      scope: 'packet_without_integrity',
    }),
  });
}

export async function verifyTeacherHandoffPacket(packet) {
  if (!packet || packet.schema !== 'mel.teacher-handoff/v1') {
    throw Object.assign(new Error('TEACHER_HANDOFF_SCHEMA_INVALID'), {
      code: 'TEACHER_HANDOFF_SCHEMA_INVALID',
      status: 400,
    });
  }
  const request = reviewRequest(packet.request);
  if (packet.request_id !== request.request_id) {
    throw Object.assign(new Error('TEACHER_HANDOFF_REQUEST_ID_MISMATCH'), {
      code: 'TEACHER_HANDOFF_REQUEST_ID_MISMATCH',
      status: 409,
    });
  }

  const packetSha = exactSha(packet.target?.sha);
  const requestSha = exactSha(request.target_sha);
  if (packetSha !== requestSha) {
    throw Object.assign(new Error('TEACHER_HANDOFF_TARGET_SHA_MISMATCH'), {
      code: 'TEACHER_HANDOFF_TARGET_SHA_MISMATCH',
      status: 409,
    });
  }

  if (packet.coordination?.repository !== MULTI_AI_PROTOCOL.repository) {
    throw Object.assign(new Error('TEACHER_HANDOFF_PROTOCOL_REPOSITORY_MISMATCH'), {
      code: 'TEACHER_HANDOFF_PROTOCOL_REPOSITORY_MISMATCH',
      status: 409,
    });
  }

  const supplied = requiredText(packet.integrity?.digest, 'TEACHER_HANDOFF_INTEGRITY_REQUIRED');
  if (!/^[0-9a-f]{64}$/i.test(supplied)) {
    throw Object.assign(new Error('TEACHER_HANDOFF_INTEGRITY_INVALID'), {
      code: 'TEACHER_HANDOFF_INTEGRITY_INVALID',
      status: 400,
    });
  }
  const expected = await sha256(unsignedPacket(packet));
  if (expected !== supplied.toLowerCase()) {
    throw Object.assign(new Error('TEACHER_HANDOFF_INTEGRITY_MISMATCH'), {
      code: 'TEACHER_HANDOFF_INTEGRITY_MISMATCH',
      status: 409,
    });
  }
  return true;
}

/**
 * Binds the Teacher answer to both the original request id/SHA and the exact
 * handoff packet digest. Existing applyTeacherReview() remains the verdict gate.
 */
export async function applyTeacherHandoffReview(packet, review = {}) {
  await verifyTeacherHandoffPacket(packet);
  const suppliedDigest = requiredText(
    review.packet_digest,
    'TEACHER_REVIEW_PACKET_DIGEST_REQUIRED',
  ).toLowerCase();
  if (suppliedDigest !== packet.integrity.digest) {
    throw Object.assign(new Error('TEACHER_REVIEW_PACKET_DIGEST_MISMATCH'), {
      code: 'TEACHER_REVIEW_PACKET_DIGEST_MISMATCH',
      status: 409,
    });
  }

  const applied = applyTeacherReview(packet.request, review);
  return Object.freeze({
    ...applied,
    packet_id: packet.packet_id,
    packet_digest: packet.integrity.digest,
    handoff_schema: packet.schema,
  });
}

export function teacherHandoffPublicView(packet) {
  if (!packet || packet.schema !== 'mel.teacher-handoff/v1') return null;
  return clean({
    schema: packet.schema,
    packet_id: packet.packet_id,
    request_id: packet.request_id,
    created_at: packet.created_at,
    objective: packet.objective,
    stage: packet.stage,
    target: packet.target,
    job: packet.job,
    council: packet.council,
    inspection: packet.inspection,
    spec: packet.spec,
    candidate: packet.candidate,
    patch_summary: packet.patch_summary,
    tests: packet.tests,
    security: packet.security,
    unknowns: packet.unknowns,
    rollback: packet.rollback,
    requested_review: packet.requested_review,
    provenance: packet.provenance,
    coordination: packet.coordination,
    additional_evidence: packet.additional_evidence,
    integrity: packet.integrity,
  });
}
