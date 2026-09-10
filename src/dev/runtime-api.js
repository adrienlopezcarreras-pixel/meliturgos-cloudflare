import { requireValue } from '../core/contracts.js';
import { DevAgent } from './dev-agent.js';
import { D1DevJobRepository } from './d1-dev-job-repository.js';
import { D1BridgeRepository } from './d1-bridge-repository.js';
import { createMentorEngine, mentorPolicy } from '../learning/mentor-engine.js';

export function devRuntime(request, env) {
  const u = new URL(request.url);
  const p = u.pathname;
  if (!p.startsWith('/api/professor/dev') && !p.startsWith('/api/dev-bridge')) return null;

  const bridge = p.startsWith('/api/dev-bridge');
  if (bridge && request.headers.get('authorization') !== `Bearer ${env.MEL_DEV_BRIDGE_TOKEN || ''}`) {
    return Response.json({ error: 'BRIDGE_AUTH_REQUIRED', code: 'BRIDGE_AUTH_REQUIRED' }, { status: 401 });
  }

  return (async () => {
    const body = request.method === 'GET' ? {} : await request.json().catch(() => ({}));
    const repo = new D1DevJobRepository(env.DB);
    const bridges = new D1BridgeRepository(env.DB);

    if (p === '/api/professor/dev/status' && request.method === 'GET') {
      return Response.json({
        ...await bridges.status(),
        capabilities: [
          'code.status', 'code.tree', 'code.search', 'code.read', 'code.diff',
          'mentor.propose', 'mentor.repair', 'mentor.learn',
          'dev.plan', 'dev.create_candidate', 'dev.apply_change', 'dev.test',
          'dev.report', 'dev.rollback', 'dev.commit'
        ],
        mentor_policy: mentorPolicy,
      });
    }

    if (p === '/api/professor/dev/jobs' && request.method === 'GET') {
      return Response.json({ jobs: await repo.list() });
    }

    if (p === '/api/professor/dev/jobs' && request.method === 'POST') {
      requireValue(typeof body.goal === 'string' && body.goal.trim(), 'GOAL_REQUIRED');
      return Response.json(await repo.create({ goal: body.goal, optional_context: body.optional_context }), { status: 201 });
    }

    const jobMatch = p.match(/^\/api\/professor\/dev\/jobs\/([^/]+)(?:\/(approve|cancel))?$/);
    if (jobMatch) {
      const job = await repo.get(jobMatch[1]);
      requireValue(job, 'JOB_NOT_FOUND', 404);
      if (request.method === 'GET') return Response.json(job);
      if (jobMatch[2] === 'approve' && request.method === 'POST') {
        requireValue(job.status === 'READY_FOR_REVIEW', 'JOB_NOT_READY', 409);
        return Response.json(await repo.update(job.id, { status: 'APPROVED', approval_status: 'APPROVED' }));
      }
      if (jobMatch[2] === 'cancel' && request.method === 'POST') {
        return Response.json(await repo.update(job.id, { status: 'CANCELLED' }));
      }
    }

    if (p === '/api/dev-bridge/heartbeat' && request.method === 'POST') {
      return Response.json(await bridges.heartbeat('ONLINE'));
    }

    if (p === '/api/dev-bridge/claim' && request.method === 'POST') {
      const job = await repo.claim();
      if (!job) return Response.json({ job: null });
      const agent = new DevAgent({
        diagnose: async input => ({ goal: input.goal, source: 'dev-agent' }),
        plan: async input => ({
          goal: input.goal,
          steps: [
            'code.search',
            'code.read',
            'dev.create_candidate',
            'mentor.propose',
            'dev.apply_change',
            'dev.test',
            'mentor.repair',
            'code.diff',
            'dev.report'
          ]
        })
      });
      const diagnosis = await agent.diagnose({ goal: job.goal });
      return Response.json(await repo.update(job.id, { plan_json: await agent.plan(diagnosis), status: 'CLAIMED' }));
    }

    if (p === '/api/dev-bridge/mentor' && request.method === 'POST') {
      requireValue(typeof body.job_id === 'string' && body.job_id, 'JOB_ID_REQUIRED');
      const job = await repo.get(body.job_id);
      requireValue(job, 'JOB_NOT_FOUND', 404);
      const engine = createMentorEngine(env);
      const proposal = await engine.propose({
        env,
        jobId: job.id,
        goal: String(body.goal || job.goal || ''),
        inspectedFiles: body.inspected_files || [],
        previousAttempts: body.previous_attempts || [],
        mode: body.mode === 'repair' ? 'repair' : 'implement',
      });
      return Response.json(proposal);
    }

    if (p === '/api/dev-bridge/mentor/outcome' && request.method === 'POST') {
      requireValue(typeof body.job_id === 'string' && body.job_id, 'JOB_ID_REQUIRED');
      const job = await repo.get(body.job_id);
      requireValue(job, 'JOB_NOT_FOUND', 404);
      const engine = createMentorEngine(env);
      const memory = await engine.recordOutcome({
        jobId: job.id,
        goal: job.goal || '',
        outcome: body.outcome || 'UNKNOWN',
        lesson: body.lesson || '',
        evidence: body.evidence || null,
        score: body.score || 0,
        tags: Array.isArray(body.tags) ? body.tags : [],
      });
      return Response.json({ ok: true, memory });
    }

    if (p === '/api/dev-bridge/result' && request.method === 'POST') {
      if (body.status === 'READY_FOR_REVIEW') {
        body.result_json = body.result_json || body.result || ((body.tests || body.diff_summary)
          ? { steps: [], tests: body.tests || [], diff_summary: body.diff_summary || 'NO_CHANGES' }
          : null);
        requireValue(body.result_json, 'RESULT_REQUIRED', 422);
      }
      return Response.json(await repo.update(body.job_id, body));
    }

    if (p === '/api/dev-bridge/commit' && request.method === 'POST') {
      const job = await repo.get(body.job_id);
      requireValue(job && job.status === 'APPROVED', 'APPROVAL_REQUIRED', 409);
      return Response.json(await repo.update(job.id, { status: 'COMMITTED', result_json: { commit: body.commit || null } }));
    }

    return Response.json({ error: 'NOT_FOUND', code: 'NOT_FOUND' }, { status: 404 });
  })().catch(error => Response.json({
    error: String(error?.message || error?.code || 'DEV_RUNTIME_ERROR'),
    code: String(error?.code || 'DEV_RUNTIME_ERROR'),
    details: error?.failures || undefined,
  }, { status: Number(error?.status) || 500 }));
}
