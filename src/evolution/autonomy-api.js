import { requireAuth } from '../core/security.js';
import { D1DevJobRepository } from '../dev/d1-dev-job-repository.js';
import { AutonomySupervisor, isSupervisedAutonomyJob } from './autonomy-supervisor.js';
import { runAutonomyRuntimeTick } from './autonomy-runtime.js';
import { getAutonomyReadiness } from './autonomy-readiness.js';
import { getAutonomyControl, setAutonomyControl, setOwnerMaxAutonomy } from './autonomy-control.js';

const TERMINAL = new Set(['COMPLETED', 'COMMITTED', 'CANCELLED', 'FAILED']);
const CANONICAL_CANDIDATE_BRANCH = 'candidate/mel-clean-autonomy';

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
      owner_override: bridge.review?.owner_override === true,
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
  const [state, readiness, control] = await Promise.all([
    supervisor.state(),
    getAutonomyReadiness({ repository: repo }),
    getAutonomyControl(env.DB),
  ]);
  const autonomyJobs = state.jobs.filter(isSupervisedAutonomyJob);
  const active = autonomyJobs.filter(job => !TERMINAL.has(String(job.status || '').toUpperCase()));
  const recent = autonomyJobs.slice().sort((a, b) => Number(b.updated_at || 0) - Number(a.updated_at || 0)).slice(0, 20).map(safeJob);
  return {
    ok: true,
    mode: control.max_autonomy ? 'OWNER_MAX_AUTONOMY' : 'SUPERVISED_AUTONOMY',
    candidate_only: true,
    zero_added_cost: true,
    runtime_schedule: '*/15 * * * *',
    repository: env.MEL_GITHUB_REPOSITORY || 'adrienlopezcarreras-pixel/meliturgos-cloudflare',
    candidate_branch: env.MEL_TEACHER_BRANCH || CANONICAL_CANDIDATE_BRANCH,
    deployed_code_branch: env.MEL_GITHUB_BRANCH || null,
    control,
    readiness: {
      status: readiness.status,
      self_development_ready: readiness.self_development_ready,
      gates: readiness.gates,
      blockers: readiness.blockers,
      next_action: readiness.next_action,
    },
    counts: {
      total_autonomy_jobs: autonomyJobs.length,
      owner_requested: autonomyJobs.filter(job => job?.requested_by === 'owner-chat').length,
      roadmap_requested: autonomyJobs.filter(job => job?.requested_by === 'mel-autonomy').length,
      active: active.length,
      completed: autonomyJobs.filter(job => ['COMPLETED', 'COMMITTED'].includes(String(job.status || '').toUpperCase())).length,
      waiting_teacher: autonomyJobs.filter(job => String(job.status || '').toUpperCase() === 'WAITING_TEACHER').length,
      teacher_approved: autonomyJobs.filter(job => String(job.status || '').toUpperCase() === 'TEACHER_APPROVED').length,
      failed: autonomyJobs.filter(job => String(job.status || '').toUpperCase() === 'FAILED').length,
    },
    active_jobs: active.slice().sort((a, b) => (a?.requested_by === 'owner-chat' ? 0 : 1) - (b?.requested_by === 'owner-chat' ? 0 : 1) || Number(a.created_at || 0) - Number(b.created_at || 0)).map(safeJob),
    recent_activity: recent,
    next: safeRoadmapItem(state.next),
  };
}

export async function maybeHandleAutonomyApi(request, env, { repository = null, fetchImpl = fetch } = {}) {
  const url = new URL(request.url);
  const isPublicControl = url.pathname === '/api/gen2/autonomy/control';
  const isState = url.pathname === '/api/gen2/autonomy/state' || url.pathname === '/api/gen2/autonomy/status';
  const isTick = url.pathname === '/api/gen2/autonomy/tick';
  const isPause = url.pathname === '/api/gen2/autonomy/pause';
  const isResume = url.pathname === '/api/gen2/autonomy/resume';
  const isMax = url.pathname === '/api/gen2/autonomy/max' || url.pathname === '/api/gen2/autonomy/owner-max';
  if (!isPublicControl && !isState && !isTick && !isPause && !isResume && !isMax) return null;

  if (isPublicControl) {
    if (request.method !== 'GET') return Response.json({ ok: false, code: 'METHOD_NOT_ALLOWED' }, { status: 405, headers: { allow: 'GET' } });
    const control = await getAutonomyControl(env.DB);
    return Response.json({
      ok: true,
      paused: control.paused === true,
      max_autonomy: control.max_autonomy === true,
      owner_override: control.owner_override === true,
      status: control.status,
      updated_at: control.updated_at,
    }, { headers: { 'cache-control': 'no-store' } });
  }

  const auth = requireAuth(request, env);
  if (!auth.ok) return auth.response;

  if (isState) {
    if (request.method !== 'GET') return Response.json({ ok: false, code: 'METHOD_NOT_ALLOWED' }, { status: 405, headers: { allow: 'GET' } });
    return Response.json(await getAutonomyState(env, { repository }), { headers: { 'cache-control': 'no-store' } });
  }

  if (request.method !== 'POST') return Response.json({ ok: false, code: 'METHOD_NOT_ALLOWED' }, { status: 405, headers: { allow: 'POST' } });
  const repo = repository || new D1DevJobRepository(env.DB);

  if (isPause || isResume) {
    const body = await request.clone().json().catch(() => ({}));
    const control = await setAutonomyControl(env.DB, {
      paused: isPause,
      source: 'owner-ui',
      reason: isPause ? (body?.reason || 'owner-emergency-stop') : null,
    });
    const state = await getAutonomyState(env, { repository: repo });
    return Response.json({ ok: true, control, state }, { headers: { 'cache-control': 'no-store' } });
  }

  if (isMax) {
    const body = await request.clone().json().catch(() => ({}));
    const enabled = body?.enabled !== false;
    const control = await setOwnerMaxAutonomy(env.DB, {
      enabled,
      source: 'owner-ui',
      reason: enabled ? 'owner-max-autonomy' : null,
    });
    const state = await getAutonomyState(env, { repository: repo });
    return Response.json({ ok: true, control, state }, { headers: { 'cache-control': 'no-store' } });
  }

  const tick = await runAutonomyRuntimeTick(env, { repository: repo, fetchImpl });
  const state = await getAutonomyState(env, { repository: repo });
  return Response.json({ ok: true, tick, state }, { headers: { 'cache-control': 'no-store' } });
}
