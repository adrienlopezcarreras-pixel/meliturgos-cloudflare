import { listPendingRuntimeTeacherRequests, applyRuntimeTeacherReply } from './runtime-teacher-bridge.js';
import { createMentorEngine } from '../learning/mentor-engine.js';

const ALLOWED_VERDICTS = new Set(['APPROVE_PLAN', 'NEEDS_CHANGES', 'REJECT']);
const SHA40 = /^[0-9a-f]{40}$/i;

function encodePath(value) {
  return String(value).split('/').filter(Boolean).map(encodeURIComponent).join('/');
}

function repositoryAndBranches(env = {}) {
  const repository = String(env.MEL_GITHUB_REPOSITORY || 'adrienlopezcarreras-pixel/meliturgos-cloudflare');
  const codeBranch = String(env.MEL_GITHUB_BRANCH || env.MEL_TEACHER_BRANCH || 'candidate/mel-clean-autonomy');
  const transportBranch = String(env.MEL_TEACHER_TRANSPORT_BRANCH || 'teacher-bridge/runtime');
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) {
    throw Object.assign(new Error('TEACHER_REPOSITORY_INVALID'), { code: 'TEACHER_REPOSITORY_INVALID' });
  }
  if (!codeBranch.startsWith('candidate/')) {
    throw Object.assign(new Error('TEACHER_BRANCH_NOT_CANDIDATE'), { code: 'TEACHER_BRANCH_NOT_CANDIDATE' });
  }
  if (!transportBranch.startsWith('teacher-bridge/')) {
    throw Object.assign(new Error('TEACHER_TRANSPORT_BRANCH_INVALID'), { code: 'TEACHER_TRANSPORT_BRANCH_INVALID' });
  }
  return { repository, codeBranch, transportBranch };
}

export function defaultTeacherRepliesUrl(env = {}) {
  const { repository, transportBranch } = repositoryAndBranches(env);
  return `https://raw.githubusercontent.com/${encodePath(repository)}/refs/heads/${encodePath(transportBranch)}/teacher-bridge/replies.jsonl`;
}

export function parseTeacherRepliesJsonl(text) {
  const replies = [];
  for (const line of String(text || '').split(/\r?\n/)) {
    if (!line.trim()) continue;
    let value;
    try { value = JSON.parse(line); } catch { continue; }
    const reply = value?.review || value?.reply || value;
    const requestId = String(reply?.request_id || value?.request_id || '');
    const targetSha = String(reply?.target_sha || value?.target_sha || '');
    const verdict = String(reply?.verdict || '').toUpperCase();
    if (!requestId || !ALLOWED_VERDICTS.has(verdict)) continue;
    replies.push({
      request_id: requestId,
      target_sha: targetSha,
      verdict,
      feedback: String(reply?.feedback || reply?.instruction || '').slice(0, 12000),
      evidence: Array.isArray(reply?.evidence) ? reply.evidence.slice(0, 100) : [],
      provenance: reply?.provenance && typeof reply.provenance === 'object'
        ? reply.provenance
        : { teacher: 'chatgpt-github-teacher-bridge' },
    });
  }
  return replies;
}

export async function fetchTeacherReplies(env = {}, { fetchImpl = fetch } = {}) {
  const url = String(env.MEL_TEACHER_REPLIES_URL || defaultTeacherRepliesUrl(env));
  const response = await fetchImpl(url, { headers: { 'user-agent': 'meliturgos-teacher-reconciler', accept: 'text/plain' } });
  if (response.status === 404) return [];
  if (!response.ok) {
    const error = new Error(`TEACHER_REPLIES_FETCH_FAILED_${response.status}`);
    error.code = 'TEACHER_REPLIES_FETCH_FAILED';
    error.status = response.status;
    throw error;
  }
  return parseTeacherRepliesJsonl(await response.text());
}

async function fetchCanonicalCandidateSha(env, fetchImpl) {
  const explicit = String(env.MEL_CANONICAL_CANDIDATE_SHA || '');
  if (SHA40.test(explicit)) return explicit;
  const { repository, codeBranch } = repositoryAndBranches(env);
  const response = await fetchImpl(
    `https://api.github.com/repos/${encodePath(repository)}/branches/${encodeURIComponent(codeBranch)}`,
    { headers: { 'user-agent': 'meliturgos-teacher-reconciler', accept: 'application/vnd.github+json' } },
  );
  if (!response.ok) return null;
  const payload = await response.json().catch(() => null);
  const sha = String(payload?.commit?.sha || '');
  return SHA40.test(sha) ? sha : null;
}

async function requeueStaleRequest(repository, request, currentSha) {
  const job = await repository.get(request.job_id);
  if (!job) return null;
  const result = job.result_json && typeof job.result_json === 'object' ? { ...job.result_json } : {};
  const state = result.teacher_bridge;
  if (state?.status !== 'WAITING_TEACHER' || state?.request?.request_id !== request.request_id) return null;

  const now = new Date().toISOString();
  const history = Array.isArray(result.teacher_bridge_history) ? [...result.teacher_bridge_history] : [];
  history.push({
    ...state,
    status: 'STALE',
    stale_at: now,
    stale_reason: 'CANDIDATE_SHA_DRIFT',
    stale_request_sha: request.target_sha || null,
    current_candidate_sha: currentSha,
  });
  result.teacher_bridge_history = history.slice(-20);
  result.last_teacher_stale = {
    request_id: request.request_id,
    previous_target_sha: request.target_sha || null,
    current_candidate_sha: currentSha,
    stale_at: now,
  };
  result.teacher_bridge = null;

  const plan = job.plan_json && typeof job.plan_json === 'object' ? { ...job.plan_json } : {};
  plan.preflight = null;
  plan.revision = {
    requested_at: now,
    previous_request_id: request.request_id,
    previous_target_sha: request.target_sha || null,
    current_candidate_sha: currentSha,
    reason: 'TEACHER_REQUEST_STALE_SHA',
  };
  const updated = await repository.update(job.id, { status: 'QUEUED', plan_json: plan, result_json: result, error: null });
  return { request_id: request.request_id, job_id: updated.id, previous_target_sha: request.target_sha || null, current_candidate_sha: currentSha };
}

async function acquireTeacherExperience(env, request, result) {
  if (result?.duplicate) return null;
  const review = result?.state?.review;
  const feedback = String(review?.feedback || '').trim();
  if (!feedback) return null;
  const mentor = createMentorEngine(env);
  const experience = await mentor.acquireExperience({
    fingerprint: `teacher-review:${result.job.id}:${request.request_id}`,
    job_id: result.job.id,
    goal: request.objective || result.job.goal || '',
    source_type: 'TEACHER_REVIEW',
    lesson: feedback,
    evidence: {
      teacher_request_id: request.request_id,
      verdict: review.verdict || null,
      target_sha: review.target_sha || request.target_sha || null,
      target_branch: String(env.MEL_GITHUB_BRANCH || env.MEL_TEACHER_BRANCH || 'candidate/mel-clean-autonomy'),
      proof_status: 'UNVALIDATED_OBSERVATION',
    },
    tags: ['teacher', 'review'],
  });
  return {
    experience_id: experience.id,
    trust: experience.trust,
    validated: false,
    source_type: 'TEACHER_REVIEW',
    occurrences: experience.evidence?.experience?.occurrences || 1,
  };
}

export async function reconcileRuntimeTeacherReplies({ repository, env = {}, fetchImpl = fetch } = {}) {
  if (!repository) throw Object.assign(new Error('TEACHER_REPOSITORY_REQUIRED'), { code: 'TEACHER_REPOSITORY_REQUIRED' });
  const pending = await listPendingRuntimeTeacherRequests(repository, { limit: 50 });
  if (!pending.length) return { ok: true, pending: 0, stale: [], applied: [], unmatched: [] };

  const currentSha = await fetchCanonicalCandidateSha(env, fetchImpl);
  const stale = [];
  const current = [];
  for (const request of pending) {
    if (currentSha && SHA40.test(String(request.target_sha || '')) && request.target_sha !== currentSha) {
      const cleaned = await requeueStaleRequest(repository, request, currentSha);
      if (cleaned) stale.push(cleaned);
      continue;
    }
    current.push(request);
  }
  if (!current.length) return { ok: true, pending: pending.length, current_sha: currentSha, stale, applied: [], unmatched: [] };

  const replies = await fetchTeacherReplies(env, { fetchImpl });
  const latestById = new Map();
  for (const reply of replies) latestById.set(reply.request_id, reply);

  const applied = [];
  const unmatched = [];
  for (const request of current) {
    const reply = latestById.get(request.request_id);
    if (!reply) {
      unmatched.push(request.request_id);
      continue;
    }
    const result = await applyRuntimeTeacherReply(repository, reply);
    let learning = null;
    try {
      learning = await acquireTeacherExperience(env, request, result);
    } catch (error) {
      learning = {
        recorded: false,
        error: String(error?.code || error?.message || 'TEACHER_EXPERIENCE_RECORD_FAILED').slice(0, 300),
      };
    }
    applied.push({
      request_id: request.request_id,
      target_sha: result.state.review?.target_sha || reply.target_sha,
      job_id: result.job.id,
      status: result.job.status,
      verdict: result.state.review?.verdict || reply.verdict,
      learning,
    });
  }
  return { ok: true, pending: pending.length, current_sha: currentSha, stale, applied, unmatched };
}
