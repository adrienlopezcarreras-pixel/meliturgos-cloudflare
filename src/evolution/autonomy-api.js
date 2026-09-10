import { requireAuth } from '../core/security.js';
import { D1DevJobRepository } from '../dev/d1-dev-job-repository.js';
import { AutonomySupervisor, isSupervisedAutonomyJob } from './autonomy-supervisor.js';
import { runAutonomyRuntimeTick } from './autonomy-runtime.js';
import { getAutonomyReadiness } from './autonomy-readiness.js';

const TERMINAL = new Set(['COMPLETED', 'COMMITTED', 'CANCELLED', 'FAILED']);

function safeJob(job) {
  const bridge = job?.result_json?.teacher_bridge || null;
  const completion = job?.result_json?.autonomy_completion || null;
  const workProof = job?.result_json?.autonomy_proofs?.work_dag_resume || null;
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
      request_id: bridge.request?.request_id || bridge.review?.request_id || null,
      verdict: bridge.review?.verdict || null,
    } : null,
    completion: completion ? {
      status: completion.status || null,
      candidate_sha: completion.candidate_sha || null,
      ci_run_id: completion.ci?.run_id || null,
      verified_at: completion.completed_at || null,
    } : null,
    work_dag_resume_proof: workProof?.status === 'VERIFIED' ? {
      status: 'VERIFIED',
      recovered_interrupted_node: workProof.recovered_interrupted_node === true,
      providers_attempted: Number(workProof.providers_attempted || 0),
      verified_at: workProof.verified_at || null,
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
  const readiness = await getAutonomyReadiness({ repository: repo });
  const autonomyJobs = state.jobs.filter(isSupervisedAutonomyJob);
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
    readiness: {
      status: readiness.status,
      self_development_ready: readiness.self_development_ready,
      gates: readiness.gates,
      blockers: readiness.blockers,
      next_action: readiness.next_action,
    },
    counts: {
      total_autonomy_jobs: autonomyJobs.length,
      owner_requested: autonomyJobs.filter((job) => job?.requested_by === 'owner-chat').length,
      roadmap_requested: autonomyJobs.filter((job) => job?.requested_by === 'mel-autonomy').length,
      active: active.length,
      completed: autonomyJobs.filter((job) => ['COMPLETED', 'COMMITTED'].includes(String(job.status || '').toUpperCase())).length,
      waiting_teacher: autonomyJobs.filter((job) => String(job.status || '').toUpperCase() === 'WAITING_TEACHER').length,
      teacher_approved: autonomyJobs.filter((job) => String(job.status || '').toUpperCase() === 'TEACHER_APPROVED').length,
      failed: autonomyJobs.filter((job) => String(job.status || '').toUpperCase() === 'FAILED').length,
    },
    active_jobs: active
      .slice()
      .sort((a, b) => (a?.requested_by === 'owner-chat' ? 0 : 1) - (b?.requested_by === 'owner-chat' ? 0 : 1) || Number(a.created_at || 0) - Number(b.created_at || 0))
      .map(safeJob),
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
  const isState = url.pathname === '/api/gen2/autonomy/state' || url.pathname === '/api/gen2/autonomy/status';
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
