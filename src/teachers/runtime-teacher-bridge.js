import { applyTeacherReview } from './teacher-request.js';
import { createTeacherHandoffPacket, applyTeacherHandoffReview } from './teacher-handoff-packet.js';

const SECRET_KEY = /(secret|token|password|authorization|cookie|api[_-]?key|otp|private[_-]?key|credential)/i;
const SECRET_VALUE = /(bearer\s+[a-z0-9._~+/=-]{8,}|\bsk-[a-z0-9_-]{8,}|\bgh[pousr]_[a-z0-9]{12,})/i;

function clean(value, depth = 0) {
  if (depth > 6) return '[TRUNCATED]';
  if (value == null || typeof value === 'boolean' || typeof value === 'number') return value;
  if (typeof value === 'string') return SECRET_VALUE.test(value) ? '[REDACTED]' : value.slice(0, 12000);
  if (Array.isArray(value)) return value.slice(0, 100).map((item) => clean(item, depth + 1));
  if (typeof value === 'object') {
    const out = {};
    for (const [key, item] of Object.entries(value).slice(0, 120)) {
      if (SECRET_KEY.test(key)) continue;
      out[key] = clean(item, depth + 1);
    }
    return out;
  }
  return String(value).slice(0, 12000);
}

function bridgeState(job) {
  return job?.result_json?.teacher_bridge || null;
}

export async function queueRuntimeTeacherRequest(repository, jobId, request, evidence = {}) {
  const job = await repository.get(jobId);
  if (!job) throw Object.assign(new Error('JOB_NOT_FOUND'), { code: 'JOB_NOT_FOUND', status: 404 });
  if (!request || request.type !== 'MEL_TEACHER_REVIEW_REQUEST' || !request.request_id || !request.target_sha) {
    throw Object.assign(new Error('TEACHER_REQUEST_REQUIRED'), { code: 'TEACHER_REQUEST_REQUIRED', status: 422 });
  }

  const current = bridgeState(job);
  if (current?.request?.request_id === request.request_id) return current;
  if (current?.status === 'WAITING_TEACHER' && current?.request?.request_id && current.request.request_id !== request.request_id) {
    throw Object.assign(new Error('TEACHER_REQUEST_ALREADY_PENDING'), { code: 'TEACHER_REQUEST_ALREADY_PENDING', status: 409 });
  }

  const result = job.result_json && typeof job.result_json === 'object' ? { ...job.result_json } : {};
  const state = {
    status: 'WAITING_TEACHER',
    request: clean(request),
    evidence: clean(evidence),
    review: null,
    queued_at: new Date().toISOString(),
    reviewed_at: null,
  };
  result.teacher_bridge = state;
  await repository.update(job.id, { status: 'WAITING_TEACHER', result_json: result });
  return state;
}

export async function listPendingRuntimeTeacherRequests(repository, { limit = 20 } = {}) {
  const jobs = await repository.list();
  const pending = [];
  for (const job of jobs) {
    const state = bridgeState(job);
    if (state?.status !== 'WAITING_TEACHER' || !state?.request?.request_id) continue;
    const request = state.request;
    pending.push({
      request_id: request.request_id,
      target_sha: request.target_sha || null,
      type: request.type,
      created_at: request.created_at || state.queued_at,
      job_id: job.id,
      objective: String(request.objective || job.goal || '').slice(0, 4000),
      stage: request.stage || 'TEACHER_REVIEW_REQUIRED',
      candidate: clean(request.candidate || null),
      patch_summary: clean(request.patch_summary || null),
      tests: clean(request.tests || []),
      unknowns: clean(request.unknowns || []),
      requested_review: clean(request.requested_review || []),
      provenance: clean(request.provenance || {}),
    });
    if (pending.length >= Math.max(1, Math.min(50, Number(limit) || 20))) break;
  }
  return pending;
}

export async function applyRuntimeTeacherReply(repository, reply) {
  const requestId = String(reply?.request_id || '');
  if (!requestId) throw Object.assign(new Error('TEACHER_REPLY_ID_REQUIRED'), { code: 'TEACHER_REPLY_ID_REQUIRED', status: 422 });

  const jobs = await repository.list();
  const job = jobs.find((candidate) => bridgeState(candidate)?.request?.request_id === requestId);
  if (!job) throw Object.assign(new Error('TEACHER_REQUEST_NOT_FOUND'), { code: 'TEACHER_REQUEST_NOT_FOUND', status: 404 });
  const state = bridgeState(job);
  if (state.status === 'ANSWERED' && state.review?.request_id === requestId) return { job, state, duplicate: true };
  if (state.status !== 'WAITING_TEACHER') {
    throw Object.assign(new Error('TEACHER_REQUEST_NOT_WAITING'), { code: 'TEACHER_REQUEST_NOT_WAITING', status: 409 });
  }

  const review = applyTeacherReview(state.request, reply);
  const result = job.result_json && typeof job.result_json === 'object' ? { ...job.result_json } : {};
  const answeredState = {
    ...state,
    status: 'ANSWERED',
    review: clean(review),
    reviewed_at: new Date().toISOString(),
  };

  if (review.development_allowed) {
    result.teacher_bridge = answeredState;
    result.last_teacher_review = clean({
      request_id: requestId,
      target_sha: review.target_sha,
      verdict: review.verdict,
      feedback: review.feedback || '',
      evidence: review.evidence || [],
      reviewed_at: answeredState.reviewed_at,
    });
    const updated = await repository.update(job.id, { status: 'TEACHER_APPROVED', result_json: result });
    return { job: updated, state: answeredState, duplicate: false, revision_required: false, terminal: false };
  }

  if (review.verdict === 'NEEDS_CHANGES') {
    const history = Array.isArray(result.teacher_bridge_history) ? [...result.teacher_bridge_history] : [];
    history.push(clean(answeredState));
    result.teacher_bridge_history = history.slice(-20);
    result.last_teacher_review = clean({
      request_id: requestId,
      target_sha: review.target_sha,
      verdict: review.verdict,
      feedback: review.feedback || '',
      evidence: review.evidence || [],
      reviewed_at: answeredState.reviewed_at,
    });
    result.teacher_bridge = null;

    const plan = job.plan_json && typeof job.plan_json === 'object' ? { ...job.plan_json } : {};
    plan.preflight = null;
    plan.revision = {
      requested_at: answeredState.reviewed_at,
      previous_request_id: requestId,
      previous_target_sha: review.target_sha,
      reason: 'TEACHER_NEEDS_CHANGES',
    };
    const updated = await repository.update(job.id, {
      status: 'QUEUED',
      plan_json: plan,
      result_json: result,
      error: null,
    });
    return { job: updated, state: answeredState, duplicate: false, revision_required: true, terminal: false };
  }

  result.teacher_bridge = answeredState;
  result.autonomy_blocked = true;
  result.autonomy_block_reason = 'TEACHER_REJECT';
  const updated = await repository.update(job.id, { status: 'FAILED', result_json: result, error: 'TEACHER_REJECT' });
  return { job: updated, state: answeredState, duplicate: false, revision_required: false, terminal: true };
}

export function teacherBridgePublicView(pending) {
  return (Array.isArray(pending) ? pending : []).map((item) => ({
    request_id: item.request_id,
    target_sha: item.target_sha || null,
    type: item.type,
    created_at: item.created_at,
    job_id: item.job_id,
    objective: item.objective,
    stage: item.stage,
    candidate: item.candidate,
    patch_summary: item.patch_summary,
    tests: item.tests,
    unknowns: item.unknowns,
    requested_review: item.requested_review,
    provenance: item.provenance,
  }));
}


/**
 * New integrity-bound Teacher transport. Kept additive so existing v2 request
 * consumers remain backward compatible while new callers can require packet
 * binding end-to-end.
 */
export async function queueRuntimeTeacherHandoff(repository, jobId, request, evidence = {}) {
  const job = await repository.get(jobId);
  if (!job) throw Object.assign(new Error('JOB_NOT_FOUND'), { code: 'JOB_NOT_FOUND', status: 404 });

  const packet = await createTeacherHandoffPacket({
    request,
    job,
    transport: 'runtime-teacher-bridge',
    additionalEvidence: evidence,
  });

  const state = await queueRuntimeTeacherRequest(repository, jobId, request, evidence);
  const refreshed = await repository.get(jobId);
  const result = refreshed?.result_json && typeof refreshed.result_json === 'object'
    ? { ...refreshed.result_json }
    : {};
  result.teacher_handoff = clean(packet);
  await repository.update(jobId, {
    status: refreshed?.status || 'WAITING_TEACHER',
    result_json: result,
  });

  return {
    state,
    packet: clean(packet),
    integrity_verified: true,
  };
}

export async function applyRuntimeTeacherHandoffReply(repository, reply) {
  const requestId = String(reply?.request_id || '');
  if (!requestId) {
    throw Object.assign(new Error('TEACHER_REPLY_ID_REQUIRED'), {
      code: 'TEACHER_REPLY_ID_REQUIRED',
      status: 422,
    });
  }

  const jobs = await repository.list();
  const job = jobs.find(candidate =>
    candidate?.result_json?.teacher_handoff?.request_id === requestId
  );
  if (!job) {
    throw Object.assign(new Error('TEACHER_HANDOFF_NOT_FOUND'), {
      code: 'TEACHER_HANDOFF_NOT_FOUND',
      status: 404,
    });
  }

  const packet = job.result_json.teacher_handoff;
  const verified = await applyTeacherHandoffReview(packet, reply);
  const applied = await applyRuntimeTeacherReply(repository, reply);

  const updatedJob = await repository.get(applied.job.id);
  const result = updatedJob?.result_json && typeof updatedJob.result_json === 'object'
    ? { ...updatedJob.result_json }
    : {};
  result.last_teacher_handoff = clean({
    packet_id: verified.packet_id,
    packet_digest: verified.packet_digest,
    handoff_schema: verified.handoff_schema,
    request_id: verified.request_id,
    target_sha: verified.target_sha,
    verdict: verified.verdict,
    reviewed_at: verified.reviewed_at,
    integrity_verified: true,
  });
  const persisted = await repository.update(updatedJob.id, {
    status: updatedJob.status,
    result_json: result,
  });

  return {
    ...applied,
    job: persisted,
    handoff_verified: true,
    packet_id: verified.packet_id,
    packet_digest: verified.packet_digest,
  };
}
