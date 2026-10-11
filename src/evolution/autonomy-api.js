import { requireAuth } from '../core/security.js';
import { D1DevJobRepository } from '../dev/d1-dev-job-repository.js';
import { AutonomySupervisor, isSupervisedAutonomyJob } from './autonomy-supervisor.js';
import { runAutonomyRuntimeTick } from './autonomy-runtime.js';
import { getAutonomyReadiness } from './autonomy-readiness.js';
import { getAutonomyControl, setAutonomyControl, setOwnerMaxAutonomy } from './autonomy-control.js';
import { AUTONOMY_RUNTIME_CRON } from './autonomy-schedule.js';
import { getAutonomyLaunchReadiness, prepareAutonomyLaunch } from './launch-readiness.js';
import { D1AlternativeRegistryStore } from '../portability/d1-alternative-registry-store.js';
import { sovereigntyCoverageFromRegistry } from '../portability/prevalidated-alternative-registry.js';
import { liveTechnicalSovereigntyReport } from '../portability/technical-sovereignty-live.js';
import { planSovereigntyGapClosure } from '../portability/sovereignty-gap-planner.js';
import { SovereigntyCandidateStore } from '../portability/sovereignty-candidate-store.js';
import { parseHttpChatProviderDescriptors } from '../augmentio/http-chat-adapter.js';
import { evaluateCandidateReadiness, readinessRequirementsForDescriptor } from '../portability/sovereignty-candidate-readiness.js';
import { localSovereigntyProfile } from '../portability/local-sovereignty-profile.js';
import { readAutonomyProgressWatchdog, resetAutonomyProgressWatchdog } from './autonomy-progress-watchdog.js';

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

export async function getAutonomyState(env, { repository = null, autonomyControlState = null, roadmap = null } = {}) {
  const repo = repository || new D1DevJobRepository(env.DB);
  const supervisor = new AutonomySupervisor({ repository: repo, ...(roadmap ? { roadmap } : {}) });
  const [state, readiness, control, progressWatchdog] = await Promise.all([
    supervisor.state(),
    getAutonomyReadiness({ repository: repo }),
    getAutonomyControl(env.DB, { memoryState: autonomyControlState }),
    readAutonomyProgressWatchdog(env.DB),
  ]);
  const autonomyJobs = state.jobs.filter(isSupervisedAutonomyJob);
  const active = autonomyJobs.filter(job => !TERMINAL.has(String(job.status || '').toUpperCase()));
  const recent = autonomyJobs.slice().sort((a, b) => Number(b.updated_at || 0) - Number(a.updated_at || 0)).slice(0, 20).map(safeJob);
  return {
    ok: true,
    mode: control.max_autonomy ? 'OWNER_MAX_AUTONOMY' : 'SUPERVISED_AUTONOMY',
    candidate_only: true,
    zero_added_cost: true,
    runtime_schedule: AUTONOMY_RUNTIME_CRON,
    repository: env.MEL_GITHUB_REPOSITORY || 'adrienlopezcarreras-pixel/meliturgos-cloudflare',
    candidate_branch: env.MEL_GITHUB_BRANCH || CANONICAL_CANDIDATE_BRANCH,
    teacher_branch: env.MEL_TEACHER_BRANCH || env.MEL_GITHUB_BRANCH || CANONICAL_CANDIDATE_BRANCH,
    deployed_code_branch: env.MEL_GITHUB_BRANCH || null,
    control,
    readiness: {
      status: readiness.status,
      self_development_ready: readiness.self_development_ready,
      gates: readiness.gates,
      blockers: readiness.blockers,
      next_action: readiness.next_action,
    },
    progress_watchdog: progressWatchdog,
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

export async function maybeHandleAutonomyApi(request, env, { repository = null, fetchImpl = fetch, autonomyControlState = null, roadmap = null } = {}) {
  const url = new URL(request.url);
  const isPublicControl = url.pathname === '/api/gen2/autonomy/control';
  const isState = url.pathname === '/api/gen2/autonomy/state' || url.pathname === '/api/gen2/autonomy/status';
  const isTick = url.pathname === '/api/gen2/autonomy/tick';
  const isPause = url.pathname === '/api/gen2/autonomy/pause';
  const isResume = url.pathname === '/api/gen2/autonomy/resume';
  const isMax = url.pathname === '/api/gen2/autonomy/max' || url.pathname === '/api/gen2/autonomy/owner-max';
  const isLaunchReadiness = url.pathname === '/api/gen2/autonomy/launch-readiness';
  const isLaunchPrepare = url.pathname === '/api/gen2/autonomy/launch-prepare';
  const isSovereignty = url.pathname === '/api/gen2/autonomy/sovereignty';
  if (!isPublicControl && !isState && !isTick && !isPause && !isResume && !isMax && !isLaunchReadiness && !isLaunchPrepare && !isSovereignty) return null;

  if (isPublicControl) {
    if (request.method !== 'GET') return Response.json({ ok: false, code: 'METHOD_NOT_ALLOWED' }, { status: 405, headers: { allow: 'GET' } });
    const control = await getAutonomyControl(env.DB, { memoryState: autonomyControlState });
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
    return Response.json(await getAutonomyState(env, { repository, autonomyControlState, roadmap }), { headers: { 'cache-control': 'no-store' } });
  }

  if (isSovereignty) {
    if (request.method !== 'GET') return Response.json({ ok: false, code: 'METHOD_NOT_ALLOWED' }, { status: 405, headers: { allow: 'GET' } });
    const store = new D1AlternativeRegistryStore(env.DB);
    const registry = await store.load();
    const coverage = sovereigntyCoverageFromRegistry(registry);
    const architecture = liveTechnicalSovereigntyReport(registry, {
      maxAutonomy: (await getAutonomyControl(env.DB, { memoryState: autonomyControlState })).max_autonomy === true,
    });
    let sovereigntyWatchReport = null;
    try {
      const watchRow = await env.DB.prepare('SELECT state_json FROM capability_watch_state WHERE id=?')
        .bind('sovereignty-replacement-watch').first();
      sovereigntyWatchReport = watchRow?.state_json ? JSON.parse(watchRow.state_json)?.report || null : null;
    } catch {}
    const gapPlan = planSovereigntyGapClosure({
      registry,
      watchReport: sovereigntyWatchReport,
    });
    const candidateStore = new SovereigntyCandidateStore(env.DB);
    const candidateRows = await candidateStore.list({ limit: 100 });
    const configuredAiReadiness = parseHttpChatProviderDescriptors(env).map((descriptor) => {
      const portableDescriptor = {
        id: descriptor.id,
        provider: descriptor.providerId,
        credential_ref: descriptor.secretEnv || null,
        added_cost_eur: descriptor.estimatedCost,
        cost_provenance: descriptor.costProvenance,
      };
      const requirements = readinessRequirementsForDescriptor('ai', portableDescriptor);
      const readiness = evaluateCandidateReadiness(
        { layer: 'ai', id: descriptor.id },
        {
          env,
          descriptor: portableDescriptor,
          requiredConfig: requirements.required_config,
          requiredSecrets: requirements.required_secrets,
        }
      );
      return {
        id: descriptor.id,
        provider: descriptor.providerId,
        model: descriptor.modelId,
        ready_for_live_test: readiness.ready_for_live_test,
        blocking_reason: readiness.blocking_reason,
        zero_cost_verified: readiness.zero_cost_verified,
        credential_refs: readiness.secret_refs,
        missing_credentials: readiness.missing_secrets,
        low_refusal_candidate: descriptor.lowRefusal === true,
        secret_values_exposed: false,
      };
    });

    const candidateSummary = {
      total: candidateRows.length,
      unverified: candidateRows.filter(row => row.status === 'UNVERIFIED').length,
      testing: candidateRows.filter(row => row.status === 'TESTING').length,
      prevalidated: candidateRows.filter(row => row.status === 'PREVALIDATED').length,
      blocked: candidateRows.filter(row => row.status === 'BLOCKED').length,
      rejected: candidateRows.filter(row => row.status === 'REJECTED').length,
      configured_ai_readiness: configuredAiReadiness,
      top: candidateRows
        .filter(row => row.status !== 'REJECTED')
        .sort((a,b) => Number(b.seen_count||0)-Number(a.seen_count||0) || Number(b.last_seen_at||0)-Number(a.last_seen_at||0))
        .slice(0,20)
        .map(row => ({
          layer: row.layer,
          id: row.id,
          provider_hint: row.provider_hint,
          status: row.status,
          seen_count: row.seen_count,
          last_seen_at: row.last_seen_at,
        })),
    };

    let localDevice = null;
    try {
      const row = await env.DB.prepare(`SELECT id,name,platform,halted,last_seen_at
        FROM computer_devices WHERE platform='windows'
        ORDER BY last_seen_at DESC LIMIT 1`).first();
      if (row) {
        localDevice = {
          id: row.id,
          name: row.name,
          platform: row.platform,
          halted: Number(row.halted) === 1,
          last_seen_at: Number(row.last_seen_at || 0),
          online: Number(row.halted) !== 1 && Date.now() - Number(row.last_seen_at || 0) < 20000,
        };
      }
    } catch {}
    const localSovereignty = localSovereigntyProfile({
      registry,
      device: localDevice,
    });
    return Response.json({
      ok: true,
      status: 'TECHNICAL_SOVEREIGNTY_STATUS',
      fully_sovereign: coverage.fully_covered === true && architecture.fully_sovereign === true,
      alternative_coverage: coverage,
      architecture_contract: {
        fully_sovereign: architecture.fully_sovereign,
        ready_layer_count: architecture.ready_layer_count,
        layer_count: architecture.layer_count,
        ready_layers: architecture.ready_layers,
        blocked_layers: architecture.blocked_layers,
      },
      registry_count: registry.all.length,
      gap_plan: gapPlan,
      replacement_candidates: candidateSummary,
      local_sovereignty: localSovereignty,
      generated_at: new Date().toISOString(),
    }, { headers: { 'cache-control': 'no-store' } });
  }

  if (isLaunchReadiness) {
    if (request.method !== 'GET') return Response.json({ ok: false, code: 'METHOD_NOT_ALLOWED' }, { status: 405, headers: { allow: 'GET' } });
    const repo = repository || new D1DevJobRepository(env.DB);
    return Response.json(await getAutonomyLaunchReadiness(env, { repository: repo }), { headers: { 'cache-control': 'no-store' } });
  }

  if (request.method !== 'POST') return Response.json({ ok: false, code: 'METHOD_NOT_ALLOWED' }, { status: 405, headers: { allow: 'POST' } });
  const repo = repository || new D1DevJobRepository(env.DB);

  if (isLaunchPrepare) {
    const prepared = await prepareAutonomyLaunch(env, { repository: repo });
    return Response.json(prepared, {
      status: prepared.ok ? 200 : 409,
      headers: { 'cache-control': 'no-store' },
    });
  }

  if (isPause) {
    const body = await request.clone().json().catch(() => ({}));
    const control = await setAutonomyControl(env.DB, {
      paused: true,
      source: 'owner-ui',
      reason: body?.reason || 'owner-emergency-stop',
      memoryState: autonomyControlState,
    });
    const state = await getAutonomyState(env, { repository: repo, autonomyControlState, roadmap });
    return Response.json({ ok: true, control, state }, { headers: { 'cache-control': 'no-store' } });
  }

  if (isResume) {
    const prepared = await prepareAutonomyLaunch(env, { repository: repo });
    if (!prepared.ok || prepared.readiness?.launch_ready !== true) {
      return Response.json({
        ok: false,
        code: 'AUTONOMY_LAUNCH_GATE_BLOCKED',
        readiness: prepared.readiness || null,
      }, { status: 409, headers: { 'cache-control': 'no-store' } });
    }
    const control = await setAutonomyControl(env.DB, {
      paused: false,
      source: 'owner-ui-launch-gate',
      reason: null,
      launch_approved_sha: prepared.readiness.candidate_sha,
      launch_approved_at: prepared.readiness.evaluated_at,
      launch_gate_digest: prepared.readiness.gate_digest,
      memoryState: autonomyControlState,
    });
    const state = await getAutonomyState(env, { repository: repo, autonomyControlState, roadmap });
    return Response.json({ ok: true, launch: prepared, control, state }, { headers: { 'cache-control': 'no-store' } });
  }

  if (isMax) {
    const body = await request.clone().json().catch(() => ({}));
    const enabled = body?.enabled !== false;
    let prepared = null;
    if (enabled) {
      prepared = await prepareAutonomyLaunch(env, { repository: repo });
      if (!prepared.ok || prepared.readiness?.launch_ready !== true) {
        return Response.json({
          ok: false,
          code: 'AUTONOMY_LAUNCH_GATE_BLOCKED',
          readiness: prepared.readiness || null,
        }, { status: 409, headers: { 'cache-control': 'no-store' } });
      }
    }
    const control = await setOwnerMaxAutonomy(env.DB, {
      enabled,
      paused: enabled ? false : undefined,
      source: enabled ? 'owner-ui-launch-gate' : 'owner-ui',
      reason: enabled ? 'owner-max-autonomy' : null,
      launch_approved_sha: prepared?.readiness?.candidate_sha,
      launch_approved_at: prepared?.readiness?.evaluated_at,
      launch_gate_digest: prepared?.readiness?.gate_digest,
      memoryState: autonomyControlState,
    });
    if (!enabled) {
      await resetAutonomyProgressWatchdog(env.DB, { status: 'DISABLED' }).catch(() => null);
    }
    let tick = null;
    if (enabled) {
      tick = await runAutonomyRuntimeTick(env, { repository: repo, fetchImpl, autonomyControlState, roadmap });
    }
    const state = await getAutonomyState(env, { repository: repo, autonomyControlState, roadmap });
    return Response.json({ ok: true, launch: prepared, control, tick, state }, { headers: { 'cache-control': 'no-store' } });
  }

  const tick = await runAutonomyRuntimeTick(env, { repository: repo, fetchImpl, autonomyControlState, roadmap });
  const state = await getAutonomyState(env, { repository: repo, autonomyControlState, roadmap });
  return Response.json({ ok: true, tick, state }, { headers: { 'cache-control': 'no-store' } });
}