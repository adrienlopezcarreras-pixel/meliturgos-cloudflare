import { requireValue } from '../core/contracts.js';
import { authorizeDevBridge, isOidcBridgeCall } from '../core/dev-bridge-auth.js';
import { authorizeGitHubActionsOidcRequest } from '../security/github-actions-oidc.js';
import { DevAgent } from './dev-agent.js';
import { D1DevJobRepository } from './d1-dev-job-repository.js';
import { D1BridgeRepository } from './d1-bridge-repository.js';
import { AutonomySupervisor } from '../evolution/autonomy-supervisor.js';
import { runAutonomyRuntimeTick } from '../evolution/autonomy-runtime.js';
import { getAutonomyControl, setAutonomyControl, isLegacyOwnerMaxStop } from '../evolution/autonomy-control.js';
import { beginAutomaticRepair, repairLane } from '../evolution/autonomy-repair.js';
import { readActivityListEpoch } from '../evolution/autonomy-activity.js';
import { jobActivityTimestamp } from '../evolution/autonomy-job-epoch.js';
import { prepareDevelopmentRequest } from '../evolution/development-preflight.js';
import { createTeacherReviewRequest } from '../teachers/teacher-request.js';
import { queueRuntimeTeacherRequest, applyRuntimeTeacherReply } from '../teachers/runtime-teacher-bridge.js';
import { mirrorRuntimeTeacherRequestToGitHub } from '../teachers/github-request-mirror.js';
import { mirrorOwnerChatTeacherRequestToGitHub } from '../teachers/owner-chat-teacher-mirror.js';
import { reconcileRuntimeCompletions } from '../teachers/github-completion-reconciler.js';
import { localBridgeFallbackAllowed, maybeDispatchCloudBridge } from '../evolution/cloud-bridge-dispatch.js';

function boundedInspection(value) {
  requireValue(value && value.status === 'COMPLETE' && Array.isArray(value.evidence) && value.evidence.length > 0, 'CODE_INSPECTION_REQUIRED', 422);
  return value;
}

function objectOrEmpty(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function normalizeBridgeTests(body, existing = []) {
  const raw = Array.isArray(body?.tests_json) ? body.tests_json : Array.isArray(body?.tests) ? body.tests : existing;
  return Array.isArray(raw) ? raw.slice(0, 50) : [];
}

function bridgeTestsNeedRepair(tests = []) {
  return tests.some((test) => test?.passed === false || Number(test?.exit_code) > 0 || Number(test?.result?.exit_code) > 0);
}

function bridgeResultFingerprint(value = {}) {
  return JSON.stringify({
    status: String(value?.status || ''),
    diff_summary: String(value?.diff_summary || ''),
    needs_repair: value?.needs_repair === true,
    tests: normalizeBridgeTests({ tests: value?.tests || [] }, []),
  });
}

function mergeBridgeResult(job, body) {
  const existingResult = objectOrEmpty(job?.result_json);
  const submitted = objectOrEmpty(body?.result_json || body?.result);
  const tests = normalizeBridgeTests(body, job?.tests_json);
  const needsRepair = body?.needs_repair === true || bridgeTestsNeedRepair(tests);
  const requestedStatus = String(body?.status || job?.status || '').slice(0, 80);
  const effectiveStatus = requestedStatus === 'READY_FOR_REVIEW' && needsRepair ? 'REPAIR_REQUIRED' : requestedStatus;
  const bridgeResult = {
    ...submitted,
    status: effectiveStatus,
    candidate_branch: String(body?.candidate_branch || job?.candidate_branch || '').slice(0, 300) || null,
    diff_summary: String(body?.diff_summary ?? submitted?.diff_summary ?? '').slice(0, 20_000),
    files: Array.isArray(body?.files_json) ? body.files_json.slice(0, 50) : Array.isArray(submitted?.files) ? submitted.files.slice(0, 50) : [],
    tests,
    needs_repair: needsRepair,
    received_at: new Date().toISOString(),
  };
  const history = Array.isArray(existingResult.dev_bridge_history) ? [...existingResult.dev_bridge_history] : [];
  const previous = existingResult.dev_bridge && typeof existingResult.dev_bridge === 'object' ? existingResult.dev_bridge : null;
  if (previous) {
    const fingerprint = bridgeResultFingerprint(previous);
    const lastFingerprint = history.length ? bridgeResultFingerprint(history[history.length - 1]) : null;
    if (fingerprint !== lastFingerprint) history.push(previous);
  }
  return { ...existingResult, dev_bridge_history: history.slice(-20), dev_bridge: bridgeResult };
}

function mergeBridgePlan(job, body) {
  const existingPlan = objectOrEmpty(job?.plan_json);
  const submitted = objectOrEmpty(body?.plan_json);
  return Object.keys(submitted).length ? { ...existingPlan, dev_bridge: submitted } : existingPlan;
}

export function hasVerifiedCompletionForJob(reconciliation, jobId) {
  const wanted = String(jobId || '');
  if (!wanted || !Array.isArray(reconciliation?.completed)) return false;
  return reconciliation.completed.some((row) => String(row?.job_id || '') === wanted && /^[a-f0-9]{40}$/i.test(String(row?.candidate_sha || '')) && Number(row?.ci_run_id || 0) > 0);
}

export async function continueAfterVerifiedCompletion({ env = {}, repository, reconciliation, jobId, runTick = runAutonomyRuntimeTick, fetchImpl = fetch } = {}) {
  if (!hasVerifiedCompletionForJob(reconciliation, jobId)) {
    return { attempted: false, ok: true, advanced: false, reason: 'NO_VERIFIED_COMPLETION' };
  }
  try {
    const tick = await runTick(env, { repository, fetchImpl });
    const job = tick?.job && typeof tick.job === 'object'
      ? {
          id: tick.job.id || null,
          status: tick.job.status || null,
          roadmap_id: tick.job.roadmap_id || tick.job.optional_context?.roadmap_id || null,
        }
      : null;
    return {
      attempted: true,
      ok: tick?.ok !== false,
      advanced: tick?.advanced === true || tick?.progress?.advanced === true,
      status: tick?.status || null,
      job,
      next: tick?.next || null,
    };
  } catch (error) {
    return {
      attempted: true,
      ok: false,
      advanced: false,
      error: String(error?.code || error?.message || 'AUTONOMY_CONTINUATION_FAILED').slice(0, 180),
    };
  }
}

async function mirrorTeacherImmediately({ env, repo, job, state, fetchImpl = fetch } = {}) {
  if (!job || !state) return { status: 'SKIPPED_NO_TEACHER_STATE' };
  const requester = String(job.requested_by || '').toLowerCase();
  if (requester.startsWith('owner-chat')) {
    return mirrorOwnerChatTeacherRequestToGitHub({ env, job, state, fetchImpl });
  }
  if (requester === 'mel-autonomy') {
    return mirrorRuntimeTeacherRequestToGitHub({ env, job, state, fetchImpl });
  }
  return { status: 'SKIPPED_UNSUPERVISED_REQUESTER', requested_by: job.requested_by || null };
}

export function devRuntime(request, env, { repository = null, bridgeRepository = null, roadmap = null, runAutonomyTick = runAutonomyRuntimeTick, dispatchCloudBridge = maybeDispatchCloudBridge } = {}) {
  const url = new URL(request.url);
  const path = url.pathname;
  if (!path.startsWith('/api/professor/dev') && !path.startsWith('/api/dev-bridge')) return null;

  const bridge = path.startsWith('/api/dev-bridge');
  // Only the cloud bridge workflow's claim/result calls may use OIDC.
  const oidcBridge = bridge && isOidcBridgeCall(request);
  if (bridge && !oidcBridge) {
    const denied = authorizeDevBridge(request, env || {});
    if (denied) return denied;
  }
  if (!env?.DB && !repository && !bridgeRepository) {
    return Response.json({ error: 'DEV_RUNTIME_DB_REQUIRED', code: 'DEV_RUNTIME_DB_REQUIRED' }, { status: 503 });
  }

  return (async () => {
    // Cloud bridge: no Worker secret to install (Cloudflare refuses secret edits
    // while a newer Worker version is pending); the exact workflow proves itself.
    if (oidcBridge) {
      const oidc = await authorizeGitHubActionsOidcRequest(request, env || {}, {
        allowedWorkflows: ['gen2-42-apply-ready-bridge.yml'],
        allowedEvents: ['workflow_dispatch'],
      });
      if (!oidc.ok) return Response.json({ error: oidc.code || 'BRIDGE_AUTH_REQUIRED', code: oidc.code || 'BRIDGE_AUTH_REQUIRED' }, { status: oidc.status || 401, headers: { 'cache-control': 'no-store' } });
    }
    const body = await request.json().catch(() => ({}));
    const repo = repository || new D1DevJobRepository(env?.DB);
    const bridges = bridgeRepository || new D1BridgeRepository(env?.DB);

    if (path === '/api/professor/dev/status' && request.method === 'GET') {
      return Response.json({
        ...await bridges.status(),
        capabilities: [
          'code.status', 'code.tree', 'code.search', 'code.read', 'code.diff',
          'dev.plan', 'dev.create_candidate', 'dev.apply_change', 'dev.test',
          'dev.report', 'dev.rollback', 'dev.commit', 'dev.autonomy.next', 'dev.autonomy.tick',
          'dev.council.preflight', 'dev.teacher.request', 'dev.teacher.reply',
        ],
      });
    }

    if (path === '/api/professor/dev/autonomy/status' && request.method === 'GET') {
      const supervisor = new AutonomySupervisor({ repository: repo, ...(roadmap ? { roadmap } : {}) });
      const state = await supervisor.state();
      return Response.json({
        ok: true,
        active_jobs: state.active,
        completed_roadmap_ids: state.completedIds,
        blocked_roadmap_ids: state.blockedIds,
        next: state.next,
      });
    }

    if (path === '/api/professor/dev/jobs' && request.method === 'GET') {
      return Response.json({ jobs: await repo.list() });
    }

    if (path === '/api/professor/dev/jobs' && request.method === 'POST') {
      requireValue(typeof body.goal === 'string' && body.goal.trim(), 'GOAL_REQUIRED');
      return Response.json(await repo.create({ goal: body.goal, optional_context: body.optional_context }), { status: 201 });
    }

    const match = path.match(/^\/api\/professor\/dev\/jobs\/([^/]+)(?:\/(approve|cancel))?$/);
    if (match) {
      const job = await repo.get(match[1]);
      requireValue(job, 'JOB_NOT_FOUND', 404);
      if (request.method === 'GET') return Response.json(job);
      if (match[2] === 'approve' && request.method === 'POST') {
        requireValue(job.status === 'READY_FOR_REVIEW', 'JOB_NOT_READY', 409);
        return Response.json(await repo.update(job.id, { status: 'APPROVED', approval_status: 'APPROVED' }));
      }
      if (match[2] === 'cancel' && request.method === 'POST') {
        return Response.json(await repo.update(job.id, { status: 'CANCELLED' }));
      }
    }

    if (path === '/api/dev-bridge/heartbeat' && request.method === 'POST') {
      return Response.json(await bridges.heartbeat('ONLINE'));
    }

    if (path === '/api/dev-bridge/autonomy/next' && request.method === 'POST') {
      const supervisor = new AutonomySupervisor({ repository: repo, ...(roadmap ? { roadmap } : {}) });
      const result = await supervisor.ensureNextJob();
      return Response.json({ ok: true, ...result });
    }

    if (path === '/api/dev-bridge/autonomy/tick' && request.method === 'POST') {
      const tick = await runAutonomyTick(env, {
        repository: repo,
        fetchImpl: fetch,
        ...(roadmap ? { roadmap } : {}),
      });
      // [ChatGPT-GPT6 / MEL-CODE-MAX-HANDOFF] An authenticated manual MAX
      // tick uses the same cloud-first dispatcher as the scheduled runtime.
      // Its D1 deduplication/atomic claim prevents racing a cron or Companion.
      // A dispatch receipt is not proof that any code was executed.
      let cloudDispatch;
      try {
        cloudDispatch = await dispatchCloudBridge(env, tick);
      } catch (error) {
        const candidate = String(error?.code || '');
        cloudDispatch = {
          status: 'FAILED',
          code: /^[A-Z0-9_]{1,80}$/.test(candidate) ? candidate : 'CLOUD_DISPATCH_FAILED',
        };
      }
      return Response.json({
        ok: tick?.ok !== false,
        tick,
        cloud_dispatch: cloudDispatch,
      }, { headers: { 'cache-control': 'no-store' } });
    }

    if (path === '/api/dev-bridge/council' && request.method === 'POST') {
      const job = await repo.get(body.job_id);
      requireValue(job, 'JOB_NOT_FOUND', 404);
      const preflight = await prepareDevelopmentRequest({
        env,
        goal: job.goal,
        context: {
          ...(job.optional_context && typeof job.optional_context === 'object' ? job.optional_context : {}),
          job_id: job.id,
          origin: 'dev-bridge-runtime',
        },
        minResponses: Math.max(2, Math.min(12, Number(body.minResponses) || 2)),
      });
      const plan = job.plan_json && typeof job.plan_json === 'object' ? { ...job.plan_json } : {};
      plan.preflight = preflight;
      const updated = await repo.update(job.id, { plan_json: plan, status: 'COUNCIL_COMPLETE' });
      return Response.json({ ok: true, job_id: job.id, status: updated.status, preflight });
    }

    if (path === '/api/dev-bridge/teacher/request' && request.method === 'POST') {
      const job = await repo.get(body.job_id);
      requireValue(job, 'JOB_NOT_FOUND', 404);
      const preflight = job.plan_json?.preflight;
      requireValue(preflight?.stage === 'AI_STATE_OF_PLAY_COMPLETE' && preflight?.council, 'AI_PREFLIGHT_REQUIRED', 409);
      const inspection = boundedInspection(body.inspection);
      const requestPackage = createTeacherReviewRequest({
        goal: job.goal,
        council: preflight.council,
        inspection,
        spec: body.spec || {},
        candidate: body.candidate || null,
        patchSummary: body.patch_summary || null,
        tests: body.tests || [],
        security: body.security || null,
        unknowns: body.unknowns || [],
        rollback: body.rollback || null,
        provenance: {
          ...(body.provenance && typeof body.provenance === 'object' ? body.provenance : {}),
          job_id: job.id,
          producer: 'MEL_RUNTIME',
          branch: job.candidate_branch || body.candidate?.branch || null,
        },
      });
      const state = await queueRuntimeTeacherRequest(repo, job.id, requestPackage, {
        inspection_status: inspection.status,
        runtime_generated: true,
        preflight_stage: preflight.stage,
      });
      const persistedJob = await repo.get(job.id);
      let teacherTransport;
      try {
        teacherTransport = await mirrorTeacherImmediately({ env, repo, job: persistedJob, state, fetchImpl: fetch });
      } catch (error) {
        teacherTransport = {
          status: 'FAILED',
          code: error?.code || error?.message || 'TEACHER_MIRROR_FAILED',
        };
      }
      return Response.json({
        ok: true,
        job_id: job.id,
        status: state.status,
        request: state.request,
        teacher_transport: teacherTransport,
        teacher_pending_visible_in_d1: true,
      });
    }

    if (path === '/api/dev-bridge/teacher/reply' && request.method === 'POST') {
      const applied = await applyRuntimeTeacherReply(repo, body.review || body);
      return Response.json({
        ok: true,
        job_id: applied.job.id,
        status: applied.job.status,
        duplicate: applied.duplicate,
        review: applied.state.review,
      });
    }

    if (path === '/api/dev-bridge/claim' && request.method === 'POST') {
      const requestedJobId = String(body?.job_id || '').trim();
      // A claimed cloud job can mutate the candidate after MAX was stopped.
      // Read the persisted owner control BEFORE any claim side effect. Owner
      // chat jobs with an exact id may still run independently; an unscoped
      // claim fails closed while MAX is stopped.
      if (env?.DB) {
        const candidateJob = requestedJobId ? await repo.get(requestedJobId) : null;
        if (!requestedJobId || candidateJob?.requested_by === 'mel-autonomy') {
          let control;
          try { control = await getAutonomyControl(env.DB); }
          catch { return Response.json({ job: null, code: 'AUTONOMY_PAUSE_CHECK_FAILED' }, { status: 503 }); }
          // An uninitialized D1 falls back to default-d1-fail-closed.
          // This is not an owner STOP: retain the independently authorized
          // local fallback contract for a scoped cloud outage. All actual
          // owner/technical runtime pauses still prevent new MAX claims.
          const activePause = control?.paused === true
            && control?.source !== 'default-d1-fail-closed';
          const repair=repairLane(control);
          if (control.repair_invalid || (control.repair && !repair)
            || (repair && requestedJobId && repair.job_id!==requestedJobId))
            return Response.json({job:null,code:'AUTONOMY_REPAIR_JOB_OUT_OF_SCOPE'},{status:409});
          if (activePause || isLegacyOwnerMaxStop(control)) {
            return Response.json({ job: null, code: 'AUTONOMY_OWNER_STOP_PAUSED' }, { status: 409 });
          }
        }
      }
      // CODEX: local bearer authentication is not autonomous execution consent.
      // Keep cloud OIDC and the shared atomic claim unchanged. A PC may only
      // claim an exact package after a scoped cloud failure and owner opt-in.
      if (!oidcBridge) {
        const localJob = requestedJobId ? await repo.get(requestedJobId) : null;
        if (!await localBridgeFallbackAllowed(env, localJob)) return Response.json(
          { job: null, code: 'LOCAL_FALLBACK_NOT_AUTHORIZED_OR_CLOUD_AVAILABLE' }, { status: 409 });
      }
      const job = requestedJobId && typeof repo.claimPrepared === 'function'
        ? await repo.claimPrepared(requestedJobId)
        : await repo.claim();
      if (!job) {
        return Response.json(
          { job: null, code: requestedJobId ? 'BRIDGE_EXACT_JOB_NOT_CLAIMABLE' : 'BRIDGE_NO_CLAIMABLE_JOB' },
          { status: requestedJobId ? 409 : 200 },
        );
      }
      if (job?.result_json?.bridge_preparation?.status === 'READY') {
        return Response.json(job);
      }
      const agent = new DevAgent({
        diagnose: async (input) => ({ goal: input.goal, source: 'dev-agent' }),
        plan: async (input) => ({ goal: input.goal, steps: ['code.search', 'code.read', 'dev.create_candidate', 'dev.test', 'code.diff'] }),
      });
      const diagnosis = await agent.diagnose({ goal: job.goal });
      const existingPlan = objectOrEmpty(job.plan_json);
      return Response.json(await repo.update(job.id, { plan_json: { ...existingPlan, legacy_dev_agent: await agent.plan(diagnosis) }, status: 'CLAIMED' }));
    }

    if (path === '/api/dev-bridge/precommit' && request.method === 'POST') {
      // The cloud Bridge may hold a CLAIM across an explicit owner STOP.
      // Revalidate the persisted stop immediately before its candidate push.
      // A failure is a veto, never permission to continue writing.
      if (!oidcBridge) return Response.json({ ok: false, code: 'PRECOMMIT_OIDC_REQUIRED' }, { status: 403 });
      const jobId = String(body?.job_id || '').trim();
      if (!jobId) return Response.json({ ok: false, code: 'PRECOMMIT_JOB_ID_REQUIRED' }, { status: 422 });
      const job = await repo.get(jobId);
      if (!job || job.status !== 'CLAIMED' || job?.result_json?.bridge_preparation?.status !== 'READY')
        return Response.json({ ok: false, code: 'PRECOMMIT_JOB_NOT_CLAIMED_READY' }, { status: 409 });
      if (job.requested_by === 'mel-autonomy') {
        let control;
        try { control = await getAutonomyControl(env.DB); }
        catch { return Response.json({ ok: false, code: 'AUTONOMY_PAUSE_CHECK_FAILED' }, { status: 503 }); }
        const actualPause = control?.paused === true && control?.source !== 'default-d1-fail-closed';
        const repair=repairLane(control);
        if (control.repair_invalid || (control.repair && !repair) || (repair && repair.job_id!==job.id))
          return Response.json({ok:false,code:'AUTONOMY_REPAIR_JOB_OUT_OF_SCOPE'},{status:409});
        if (actualPause || isLegacyOwnerMaxStop(control))
          return Response.json({ ok: false, code: 'AUTONOMY_OWNER_STOP_PAUSED' }, { status: 409 });
      }
      return Response.json({ ok: true, code: 'PRECOMMIT_ALLOWED', job_id: jobId }, { headers: { 'cache-control': 'no-store' } });
    }

    if (path === '/api/dev-bridge/result' && request.method === 'POST') {
      const job = await repo.get(body.job_id);
      requireValue(job, 'JOB_NOT_FOUND', 404);
      let submitted = body.result_json || body.result || null;
      if (body.status === 'READY_FOR_REVIEW' && !submitted) {
        submitted = (body.tests || body.tests_json || body.diff_summary)
          ? { steps: [], tests: body.tests_json || body.tests || [], diff_summary: body.diff_summary || 'NO_CHANGES' }
          : null;
        requireValue(submitted, 'RESULT_REQUIRED', 422);
      }
      const normalizedBody = { ...body, result_json: submitted || {} };
      const tests = normalizeBridgeTests(normalizedBody, job.tests_json);
      const mergedResult = mergeBridgeResult(job, normalizedBody);
      const effectiveStatus = mergedResult.dev_bridge?.status || String(body.status || job.status || '').slice(0, 80) || job.status;
      const patch = {
        status: effectiveStatus,
        candidate_branch: body.candidate_branch || job.candidate_branch,
        tests_json: tests,
        result_json: mergedResult,
        plan_json: mergeBridgePlan(job, normalizedBody),
        patch_json: {
          ...objectOrEmpty(job.patch_json),
          dev_bridge_diff_summary: String(body.diff_summary || '').slice(0, 20_000),
          dev_bridge_received_at: new Date().toISOString(),
        },
        error: body.error ? String(body.error).slice(0, 500) : null,
      };
      const updated = await repo.update(job.id, patch);
      // The owner wants ONE roadmap mission at a time. A failed autonomous
      // Bridge must pause the runtime before any further mission is admitted.
      // Do not override an owner STOP or a concurrent owner resume: CAS binds
      // the pause to the precise control version observed before the write.
      if (job.requested_by === 'mel-autonomy'
          && (effectiveStatus === 'REPAIR_REQUIRED' || mergedResult.dev_bridge?.needs_repair === true)) {
        let control;
        try {
          control = await getAutonomyControl(env.DB);
          if (control.paused !== true && control.max_autonomy === true) {
            const epoch=await readActivityListEpoch(env.DB,{strict:true});
            if (!epoch || jobActivityTimestamp(job)>=epoch)
              control=await beginAutomaticRepair(env.DB,updated,control);
          } else if (control.paused !== true) {
            const ownerStopped = isLegacyOwnerMaxStop(control);
            control = await setAutonomyControl(env.DB, {
              paused: true, max_autonomy: false,
              source: ownerStopped ? 'owner-ui' : 'bridge-repair-pause',
              reason: ownerStopped ? 'owner-stop' : ('bridge-repair-required:' + job.id).slice(0, 500),
              expected_updated_at: control.updated_at,
            });
          }
        } catch (error) {
          // Tests were recorded, but PAUSE was not proven. The reporting
          // workflow must fail shut rather than chain into another mission.
          return Response.json({
            ...updated, autonomy_pause: {
              confirmed: false, code: error?.code || 'AUTONOMY_REPAIR_PAUSE_UNVERIFIED',
            },
          }, { status: 503 });
        }
        return Response.json({
          ...updated, autonomy_pause: {
            confirmed: control.paused === true || repairLane(control)?.job_id===job.id,
            scope: control.paused === true ? 'RUNTIME' : 'MISSION_STREAM',
            repairing: repairLane(control)?.job_id===job.id,
            status: repairLane(control)?.job_id===job.id ? 'REPAIR_ONLY' : control.status, reason: control.reason,
          },
        });
      }
      if (effectiveStatus !== 'READY_FOR_REVIEW' || mergedResult.dev_bridge?.needs_repair === true) {
        return Response.json(updated);
      }

      let completionReconciliation;
      try {
        completionReconciliation = await reconcileRuntimeCompletions({ repository: repo, env, fetchImpl: fetch });
      } catch (error) {
        completionReconciliation = {
          ok: false,
          error: error?.code || error?.message || 'COMPLETION_RECONCILE_FAILED',
          completed: [],
          rejected: [],
        };
      }
      const refreshed = await repo.get(job.id) || updated;
      const autonomousContinuation = await continueAfterVerifiedCompletion({
        env,
        repository: repo,
        reconciliation: completionReconciliation,
        jobId: job.id,
        fetchImpl: fetch,
      });
      return Response.json({
        ...refreshed,
        immediate_completion_reconciliation: {
          attempted: true,
          ok: completionReconciliation?.ok !== false,
          completed: Array.isArray(completionReconciliation?.completed) ? completionReconciliation.completed : [],
          rejected: Array.isArray(completionReconciliation?.rejected) ? completionReconciliation.rejected : [],
          error: completionReconciliation?.error || null,
        },
        immediate_autonomy_continuation: autonomousContinuation,
      });
    }

    if (path === '/api/dev-bridge/commit' && request.method === 'POST') {
      const job = await repo.get(body.job_id);
      requireValue(job && job.status === 'APPROVED', 'APPROVAL_REQUIRED', 409);
      return Response.json(await repo.update(job.id, { status: 'COMMITTED', result_json: { ...objectOrEmpty(job.result_json), commit: body.commit || null } }));
    }

    return Response.json({ error: 'NOT_FOUND', code: 'NOT_FOUND' }, { status: 404 });
  })();
}

export { mergeBridgeResult, mergeBridgePlan, normalizeBridgeTests, bridgeTestsNeedRepair, bridgeResultFingerprint, mirrorTeacherImmediately };
