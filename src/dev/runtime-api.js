import { requireValue } from '../core/contracts.js';
import { DevAgent } from './dev-agent.js';
import { D1DevJobRepository } from './d1-dev-job-repository.js';
import { D1BridgeRepository } from './d1-bridge-repository.js';
import { AutonomySupervisor } from '../evolution/autonomy-supervisor.js';
import { prepareDevelopmentRequest } from '../evolution/development-preflight.js';
import { createTeacherReviewRequest } from '../teachers/teacher-request.js';
import { queueRuntimeTeacherRequest, applyRuntimeTeacherReply } from '../teachers/runtime-teacher-bridge.js';

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

function mergeBridgeResult(job, body) {
  const existingResult = objectOrEmpty(job?.result_json);
  const submitted = objectOrEmpty(body?.result_json || body?.result);
  const bridgeResult = {
    ...submitted,
    status: String(body?.status || job?.status || '').slice(0, 80),
    candidate_branch: String(body?.candidate_branch || job?.candidate_branch || '').slice(0, 300) || null,
    diff_summary: String(body?.diff_summary ?? submitted?.diff_summary ?? '').slice(0, 20_000),
    files: Array.isArray(body?.files_json) ? body.files_json.slice(0, 50) : Array.isArray(submitted?.files) ? submitted.files.slice(0, 50) : [],
    tests: normalizeBridgeTests(body, job?.tests_json),
    needs_repair: body?.needs_repair === true || normalizeBridgeTests(body, job?.tests_json).some((test) => test?.passed === false || Number(test?.exit_code) > 0 || Number(test?.result?.exit_code) > 0),
    received_at: new Date().toISOString(),
  };
  return { ...existingResult, dev_bridge: bridgeResult };
}

function mergeBridgePlan(job, body) {
  const existingPlan = objectOrEmpty(job?.plan_json);
  const submitted = objectOrEmpty(body?.plan_json);
  return Object.keys(submitted).length ? { ...existingPlan, dev_bridge: submitted } : existingPlan;
}

export function devRuntime(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;
  if (!path.startsWith('/api/professor/dev') && !path.startsWith('/api/dev-bridge')) return null;

  const bridge = path.startsWith('/api/dev-bridge');
  if (bridge && request.headers.get('authorization') !== `Bearer ${env.MEL_DEV_BRIDGE_TOKEN || ''}`) {
    return Response.json({ error: 'BRIDGE_AUTH_REQUIRED', code: 'BRIDGE_AUTH_REQUIRED' }, { status: 401 });
  }

  return (async () => {
    const body = await request.json().catch(() => ({}));
    const repo = new D1DevJobRepository(env.DB);
    const bridges = new D1BridgeRepository(env.DB);

    if (path === '/api/professor/dev/status' && request.method === 'GET') {
      return Response.json({
        ...await bridges.status(),
        capabilities: [
          'code.status', 'code.tree', 'code.search', 'code.read', 'code.diff',
          'dev.plan', 'dev.create_candidate', 'dev.apply_change', 'dev.test',
          'dev.report', 'dev.rollback', 'dev.commit', 'dev.autonomy.next',
          'dev.council.preflight', 'dev.teacher.request', 'dev.teacher.reply',
        ],
      });
    }

    if (path === '/api/professor/dev/autonomy/status' && request.method === 'GET') {
      const supervisor = new AutonomySupervisor({ repository: repo });
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
      const supervisor = new AutonomySupervisor({ repository: repo });
      const result = await supervisor.ensureNextJob();
      return Response.json({ ok: true, ...result });
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
      return Response.json({ ok: true, job_id: job.id, status: state.status, request: state.request });
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
      const job = await repo.claim();
      if (!job) return Response.json({ job: null });
      // A supervised job already carries its Council/Teacher/Mentor plan. Do not
      // overwrite that evidence with the legacy one-shot diagnostic plan.
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
      const patch = {
        status: String(body.status || job.status || '').slice(0, 80) || job.status,
        candidate_branch: body.candidate_branch || job.candidate_branch,
        tests_json: tests,
        result_json: mergeBridgeResult(job, normalizedBody),
        plan_json: mergeBridgePlan(job, normalizedBody),
        patch_json: {
          ...objectOrEmpty(job.patch_json),
          dev_bridge_diff_summary: String(body.diff_summary || '').slice(0, 20_000),
          dev_bridge_received_at: new Date().toISOString(),
        },
        error: body.error ? String(body.error).slice(0, 500) : null,
      };
      return Response.json(await repo.update(job.id, patch));
    }

    if (path === '/api/dev-bridge/commit' && request.method === 'POST') {
      const job = await repo.get(body.job_id);
      requireValue(job && job.status === 'APPROVED', 'APPROVAL_REQUIRED', 409);
      return Response.json(await repo.update(job.id, { status: 'COMMITTED', result_json: { ...objectOrEmpty(job.result_json), commit: body.commit || null } }));
    }

    return Response.json({ error: 'NOT_FOUND', code: 'NOT_FOUND' }, { status: 404 });
  })();
}

export { mergeBridgeResult, mergeBridgePlan, normalizeBridgeTests };
