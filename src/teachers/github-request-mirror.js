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

function encodePath(value) {
  return String(value).split('/').filter(Boolean).map(encodeURIComponent).join('/');
}

function safeFilePart(value) {
  const out = String(value || '').replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^_+|_+$/g, '');
  return (out || 'request').slice(0, 180);
}

function repoAndBranch(env = {}) {
  const repository = String(env.MEL_GITHUB_REPOSITORY || 'adrienlopezcarreras-pixel/meliturgos-cloudflare');
  const branch = String(env.MEL_TEACHER_BRANCH || 'candidate/augmentio-core');
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) {
    throw Object.assign(new Error('TEACHER_MIRROR_REPOSITORY_INVALID'), { code: 'TEACHER_MIRROR_REPOSITORY_INVALID' });
  }
  if (!branch.startsWith('candidate/')) {
    throw Object.assign(new Error('TEACHER_MIRROR_BRANCH_NOT_CANDIDATE'), { code: 'TEACHER_MIRROR_BRANCH_NOT_CANDIDATE' });
  }
  return { repository, branch };
}

function utf8Base64(text) {
  const bytes = new TextEncoder().encode(String(text));
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function buildRuntimeTeacherMirror(job, state) {
  if (!job || job.requested_by !== 'mel-autonomy') return null;
  const request = state?.request;
  if (!request?.request_id) return null;
  return clean({
    kind: 'MEL_RUNTIME_REQUEST',
    schema_version: 1,
    request_id: request.request_id,
    job_id: job.id,
    roadmap_id: job.optional_context?.roadmap_id || request.provenance?.roadmap_id || null,
    priority: job.optional_context?.priority || 'P0',
    created_at: request.created_at || state.queued_at || new Date().toISOString(),
    stage: request.stage || 'TEACHER_REVIEW_REQUIRED',
    objective: String(job.goal || request.objective || '').slice(0, 4000),
    candidate: request.candidate || null,
    patch_summary: request.patch_summary || null,
    tests: request.tests || [],
    unknowns: request.unknowns || [],
    requested_review: request.requested_review || [],
    provenance: request.provenance || {},
    constraints: {
      candidate_only: true,
      zero_added_cost: true,
      production_deploy_allowed: false,
      no_destructive_d1: true,
    },
  });
}

/**
 * Optional transport mirror for internally generated roadmap work. The source
 * of truth remains D1; this merely gives the external ChatGPT Teacher a stable,
 * connector-friendly handoff that does not require MEL's password.
 *
 * Owner-chat work is never mirrored. If no GitHub token is configured, the
 * runtime continues via the existing public read-only Teacher endpoints.
 */
export async function mirrorRuntimeTeacherRequestToGitHub({ env = {}, job, state, fetchImpl = fetch } = {}) {
  const payload = buildRuntimeTeacherMirror(job, state);
  if (!payload) return { status: 'SKIPPED_NOT_INTERNAL_AUTONOMY' };

  const token = String(env.MEL_GITHUB_TOKEN || '');
  if (!token) return { status: 'SKIPPED_NO_GITHUB_TOKEN', request_id: payload.request_id };

  const { repository, branch } = repoAndBranch(env);
  const path = `teacher-bridge/runtime-requests/${safeFilePart(payload.request_id)}.json`;
  const apiPath = `https://api.github.com/repos/${encodePath(repository)}/contents/${encodePath(path)}`;
  const headers = {
    accept: 'application/vnd.github+json',
    authorization: `Bearer ${token}`,
    'content-type': 'application/json',
    'user-agent': 'meliturgos-teacher-request-mirror',
    'x-github-api-version': '2022-11-28',
  };

  const existing = await fetchImpl(`${apiPath}?ref=${encodeURIComponent(branch)}`, { headers });
  if (existing.status === 200) {
    return { status: 'ALREADY_PRESENT', request_id: payload.request_id, repository, branch, path };
  }
  if (existing.status !== 404) {
    return {
      status: 'FAILED',
      code: 'TEACHER_MIRROR_GITHUB_READ_FAILED',
      http_status: existing.status,
      request_id: payload.request_id,
      repository,
      branch,
      path,
    };
  }

  const response = await fetchImpl(apiPath, {
    method: 'PUT',
    headers,
    body: JSON.stringify({
      message: `teacher: mirror runtime request ${safeFilePart(payload.request_id)}`,
      content: utf8Base64(`${JSON.stringify(payload, null, 2)}\n`),
      branch,
    }),
  });

  if (response.status === 200 || response.status === 201) {
    return { status: 'MIRRORED', request_id: payload.request_id, repository, branch, path };
  }

  if (response.status === 422) {
    const raced = await fetchImpl(`${apiPath}?ref=${encodeURIComponent(branch)}`, { headers });
    if (raced.status === 200) {
      return { status: 'ALREADY_PRESENT', request_id: payload.request_id, repository, branch, path };
    }
  }

  return {
    status: 'FAILED',
    code: 'TEACHER_MIRROR_GITHUB_WRITE_FAILED',
    http_status: response.status,
    request_id: payload.request_id,
    repository,
    branch,
    path,
  };
}
