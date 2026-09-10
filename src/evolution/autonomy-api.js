import { requireAuth } from '../core/security.js';
import { D1DevJobRepository } from '../dev/d1-dev-job-repository.js';
import { AutonomySupervisor } from './autonomy-supervisor.js';
import { runAutonomyRuntimeTick } from './autonomy-runtime.js';

const TERMINAL = new Set(['COMPLETED', 'COMMITTED', 'CANCELLED', 'FAILED']);

function safeJob(job) {
  const bridge = job?.result_json?.teacher_bridge || null;
  const completion = job?.result_json?.autonomy_completion || null;
  return {
    id: String(job?.id || ''),
    status: String(job?.status || ''),
    requested_by: String(job?.requested_by || ''),
    roadmap_id: job?.optional_context?.roadmap_id || null,
    phase_id: job?.optional_context?.phase_id || null,
    priority: job?.optional_context?.priority || null,
    candidate_branch: job?.candidate_branch || null,
    teacher: bridge ? {
      status: bridge.status || null,
      request_id: bridge.request?.request_id || null,
      verdict: bridge.review?.verdict || null,
    } : null,
    completion: completion ? {
      status: completion.status || null,
      candidate_sha: completion.candidate_sha || null,
      ci_run_id: completion.ci_run_id || null,
      verified_at: completion.verified_at || null,
    } : null,
    created_at: job?.created_at || null,
    updated_at: job?.updated_at || null,
  };
}

function safeRoadmapItem(item) {
  if (!item) return null;
  return {
    id: item.id || null,
    phase_id: item.phase_id || null,
    phase: item.phase || null,
    title: item.title || null,
    status: item.status || null,
    priority: item.priority || null,
    next: item.next || null,
  };
}

export async function getAutonomyState(env, { repository = null } = {}) {
  const repo = repository || new D1DevJobRepository(env.DB);
  const supervisor = new AutonomySupervisor({ repository: repo });
  const state = await supervisor.state();
  const autonomyJobs = state.jobs.filter((job) => job?.requested_by === 'mel-autonomy');
  const active = autonomyJobs.filter((job) => !TERMINAL.has(String(job.status || '').toUpperCase()));
  return {
    ok: true,
    mode: 'SUPERVISED_AUTONOMY',
    candidate_only: true,
    zero_added_cost: true,
    runtime_schedule: '*/15 * * * *',
    repository: env.MEL_GITHUB_REPOSITORY || 'adrienlopezcarreras-pixel/meliturgos-cloudflare',
    candidate_branch: env.MEL_TEACHER_BRANCH || 'candidate/augmentio-core',
    deployed_code_branch: env.MEL_GITHUB_BRANCH || null,
    counts: {
      total_autonomy_jobs: autonomyJobs.length,
      active: active.length,
      completed: autonomyJobs.filter((job) => ['COMPLETED', 'COMMITTED'].includes(String(job.status || '').toUpperCase())).length,
      waiting_teacher: autonomyJobs.filter((job) => String(job.status || '').toUpperCase() === 'WAITING_TEACHER').length,
      teacher_approved: autonomyJobs.filter((job) => String(job.status || '').toUpperCase() === 'TEACHER_APPROVED').length,
      failed: autonomyJobs.filter((job) => String(job.status || '').toUpperCase() === 'FAILED').length,
    },
    active_jobs: active.map(safeJob),
    next: safeRoadmapItem(state.next),
  };
}

/**
 * Authenticated operator API. GET is diagnostic only; POST tick runs the same
 * bounded candidate-only heartbeat as the scheduled cron. It does not deploy,
 * alter auth/DNS/billing, or bypass Teacher/CI gates.
 */
export async function maybeHandleAutonomyApi(request, env, { repository = null, fetchImpl = fetch } = {}) {
  const url = new URL(request.url);
  const isState = url.pathname === '/api/gen2/autonomy/state';
  const isTick = url.pathname === '/api/gen2/autonomy/tick';
  if (!isState && !isTick) return null;

  const auth = requireAuth(request, env);
  if (!auth.ok) return auth.response;

  if (isState) {
    if (request.method !== 'GET') return Response.json({ ok: false, code: 'METHOD_NOT_ALLOWED' }, { status: 405, headers: { allow: 'GET' } });
    return Response.json(await getAutonomyState(env, { repository }), { headers: { 'cache-control': 'no-store' } });
  }

  if (request.method !== 'POST') return Response.json({ ok: false, code: 'METHOD_NOT_ALLOWED' }, { status: 405, headers: { allow: 'POST' } });
  const repo = repository || new D1DevJobRepository(env.DB);
  const tick = await runAutonomyRuntimeTick(env, { repository: repo, fetchImpl });
  const state = await getAutonomyState(env, { repository: repo });
  return Response.json({ ok: true, tick, state }, { headers: { 'cache-control': 'no-store' } });
}
