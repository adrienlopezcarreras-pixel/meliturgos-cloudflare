import { listPendingRuntimeTeacherRequests, applyRuntimeTeacherReply } from './runtime-teacher-bridge.js';

const ALLOWED_VERDICTS = new Set(['APPROVE_PLAN', 'NEEDS_CHANGES', 'REJECT']);

function encodePath(value) {
  return String(value).split('/').filter(Boolean).map(encodeURIComponent).join('/');
}

export function defaultTeacherRepliesUrl(env = {}) {
  const repository = String(env.MEL_GITHUB_REPOSITORY || 'adrienlopezcarreras-pixel/meliturgos-cloudflare');
  const branch = String(env.MEL_TEACHER_BRANCH || 'candidate/augmentio-core');
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) {
    throw Object.assign(new Error('TEACHER_REPOSITORY_INVALID'), { code: 'TEACHER_REPOSITORY_INVALID' });
  }
  if (!branch.startsWith('candidate/')) {
    throw Object.assign(new Error('TEACHER_BRANCH_NOT_CANDIDATE'), { code: 'TEACHER_BRANCH_NOT_CANDIDATE' });
  }
  return `https://raw.githubusercontent.com/${encodePath(repository)}/refs/heads/${encodePath(branch)}/teacher-bridge/replies.jsonl`;
}

export function parseTeacherRepliesJsonl(text) {
  const replies = [];
  for (const line of String(text || '').split(/\r?\n/)) {
    if (!line.trim()) continue;
    let value;
    try { value = JSON.parse(line); } catch { continue; }
    const reply = value?.review || value?.reply || value;
    const requestId = String(reply?.request_id || value?.request_id || '');
    const verdict = String(reply?.verdict || '').toUpperCase();
    if (!requestId || !ALLOWED_VERDICTS.has(verdict)) continue;
    replies.push({
      request_id: requestId,
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

export async function reconcileRuntimeTeacherReplies({ repository, env = {}, fetchImpl = fetch } = {}) {
  if (!repository) throw Object.assign(new Error('TEACHER_REPOSITORY_REQUIRED'), { code: 'TEACHER_REPOSITORY_REQUIRED' });
  const pending = await listPendingRuntimeTeacherRequests(repository, { limit: 50 });
  if (!pending.length) return { ok: true, pending: 0, applied: [], unmatched: [] };

  const replies = await fetchTeacherReplies(env, { fetchImpl });
  const latestById = new Map();
  for (const reply of replies) latestById.set(reply.request_id, reply);

  const applied = [];
  const unmatched = [];
  for (const request of pending) {
    const reply = latestById.get(request.request_id);
    if (!reply) {
      unmatched.push(request.request_id);
      continue;
    }
    const result = await applyRuntimeTeacherReply(repository, reply);
    applied.push({ request_id: request.request_id, job_id: result.job.id, status: result.job.status, verdict: result.state.review?.verdict || reply.verdict });
  }
  return { ok: true, pending: pending.length, applied, unmatched };
}
