import { D1DevJobRepository } from '../dev/d1-dev-job-repository.js';
import { listPendingRuntimeTeacherRequests, teacherBridgePublicView } from './runtime-teacher-bridge.js';
import { isSupervisedAutonomyJob } from '../evolution/autonomy-supervisor.js';

const TERMINAL = new Set(['COMPLETED', 'COMMITTED', 'CANCELLED', 'FAILED']);

function currentTeacherMetadata(job) {
  const bridge = job?.result_json?.teacher_bridge || null;
  if (!bridge) return { teacher_status: null, request_id: null, verdict: null };
  return {
    teacher_status: bridge.status || null,
    request_id: bridge.request?.request_id || bridge.review?.request_id || null,
    verdict: bridge.review?.verdict || null,
  };
}

function summarizeAutonomyJobs(jobs = []) {
  const autonomy = jobs.filter(isSupervisedAutonomyJob);
  const active = autonomy.filter((job) => !TERMINAL.has(String(job.status || '').toUpperCase()));
  const current = active
    .slice()
    .sort((a, b) => {
      const ownerA = a?.requested_by === 'owner-chat' ? 0 : 1;
      const ownerB = b?.requested_by === 'owner-chat' ? 0 : 1;
      return ownerA - ownerB || Number(a.created_at || 0) - Number(b.created_at || 0);
    })[0] || null;
  const teacher = current ? currentTeacherMetadata(current) : null;
  return {
    total: autonomy.length,
    active_count: active.length,
    owner_requested_count: autonomy.filter((job) => job?.requested_by === 'owner-chat').length,
    waiting_teacher_count: autonomy.filter((job) => String(job.status || '').toUpperCase() === 'WAITING_TEACHER').length,
    teacher_approved_count: autonomy.filter((job) => String(job.status || '').toUpperCase() === 'TEACHER_APPROVED').length,
    completed_count: autonomy.filter((job) => ['COMPLETED', 'COMMITTED'].includes(String(job.status || '').toUpperCase())).length,
    failed_count: autonomy.filter((job) => String(job.status || '').toUpperCase() === 'FAILED').length,
    current: current ? {
      job_id: String(current.id || ''),
      requested_by: current.requested_by === 'owner-chat' ? 'owner-chat' : 'mel-autonomy',
      status: String(current.status || ''),
      roadmap_id: current?.optional_context?.roadmap_id || null,
      teacher_status: teacher.teacher_status,
      request_id: teacher.request_id,
      verdict: teacher.verdict,
    } : null,
  };
}

/**
 * Deliberately public, read-only and aggressively minimized so the external
 * ChatGPT Teacher can discover pending technical requests without receiving a
 * MEL secret. Opaque job/request ids are exposed for reliable correlation;
 * full job state, council text, inspection contents, goals and user data remain
 * behind authenticated/runtime channels.
 */
export async function maybeHandlePublicTeacherBridge(request, env) {
  if (request.method !== 'GET') return null;
  const url = new URL(request.url);
  if (url.pathname !== '/api/teacher/pending' && url.pathname !== '/api/teacher/status') return null;

  const repository = new D1DevJobRepository(env.DB);
  const [pendingRows, jobs] = await Promise.all([
    listPendingRuntimeTeacherRequests(repository, { limit: 20 }),
    repository.list(),
  ]);
  const pending = teacherBridgePublicView(pendingRows);
  const autonomy = summarizeAutonomyJobs(jobs);
  const headers = {
    'cache-control': 'no-store, max-age=0',
    'content-type': 'application/json; charset=utf-8',
    'x-content-type-options': 'nosniff',
  };

  if (url.pathname === '/api/teacher/status') {
    return new Response(JSON.stringify({
      ok: true,
      channel: 'github-teacher-bridge',
      pending_count: pending.length,
      autonomy,
      exposes_secrets: false,
      exposes_goals: false,
      mutation_allowed: false,
    }), { status: 200, headers });
  }

  return new Response(JSON.stringify({
    ok: true,
    channel: 'github-teacher-bridge',
    pending,
    autonomy,
    mutation_allowed: false,
  }), { status: 200, headers });
}

export { summarizeAutonomyJobs };
