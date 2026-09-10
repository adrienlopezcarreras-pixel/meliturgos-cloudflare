import { D1DevJobRepository } from '../dev/d1-dev-job-repository.js';
import { listPendingRuntimeTeacherRequests, teacherBridgePublicView } from './runtime-teacher-bridge.js';

const TERMINAL = new Set(['COMPLETED', 'COMMITTED', 'CANCELLED', 'FAILED']);

function summarizeAutonomyJobs(jobs = []) {
  const autonomy = jobs.filter((job) => job?.requested_by === 'mel-autonomy');
  const active = autonomy.filter((job) => !TERMINAL.has(String(job.status || '').toUpperCase()));
  const current = active
    .slice()
    .sort((a, b) => Number(a.created_at || 0) - Number(b.created_at || 0))[0] || null;
  return {
    total: autonomy.length,
    active_count: active.length,
    waiting_teacher_count: autonomy.filter((job) => String(job.status || '').toUpperCase() === 'WAITING_TEACHER').length,
    teacher_approved_count: autonomy.filter((job) => String(job.status || '').toUpperCase() === 'TEACHER_APPROVED').length,
    completed_count: autonomy.filter((job) => ['COMPLETED', 'COMMITTED'].includes(String(job.status || '').toUpperCase())).length,
    failed_count: autonomy.filter((job) => String(job.status || '').toUpperCase() === 'FAILED').length,
    current: current ? {
      job_id: String(current.id || ''),
      status: String(current.status || ''),
      roadmap_id: current?.optional_context?.roadmap_id || null,
    } : null,
  };
}

/**
 * Deliberately public, read-only and aggressively minimized so the external
 * ChatGPT Teacher can discover pending technical requests without receiving a
 * MEL secret. Full job state, council text, inspection contents, goals and user
 * data remain behind authenticated/runtime channels.
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
