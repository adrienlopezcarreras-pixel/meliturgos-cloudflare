import { requireValue } from '../core/contracts.js';
import { DevAgent } from './dev-agent.js';
import { D1DevJobRepository } from './d1-dev-job-repository.js';
import { D1BridgeRepository } from './d1-bridge-repository.js';
import { AutonomySupervisor } from '../evolution/autonomy-supervisor.js';

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

    if (path === '/api/dev-bridge/claim' && request.method === 'POST') {
      const job = await repo.claim();
      if (!job) return Response.json({ job: null });
      const agent = new DevAgent({
        diagnose: async (input) => ({ goal: input.goal, source: 'dev-agent' }),
        plan: async (input) => ({ goal: input.goal, steps: ['code.search', 'code.read', 'dev.create_candidate', 'dev.test', 'code.diff'] }),
      });
      const diagnosis = await agent.diagnose({ goal: job.goal });
      return Response.json(await repo.update(job.id, { plan_json: await agent.plan(diagnosis), status: 'CLAIMED' }));
    }

    if (path === '/api/dev-bridge/result' && request.method === 'POST') {
      if (body.status === 'READY_FOR_REVIEW') {
        body.result_json = body.result_json || body.result || ((body.tests || body.diff_summary)
          ? { steps: [], tests: body.tests || [], diff_summary: body.diff_summary || 'NO_CHANGES' }
          : null);
        requireValue(body.result_json, 'RESULT_REQUIRED', 422);
      }
      return Response.json(await repo.update(body.job_id, body));
    }

    if (path === '/api/dev-bridge/commit' && request.method === 'POST') {
      const job = await repo.get(body.job_id);
      requireValue(job && job.status === 'APPROVED', 'APPROVAL_REQUIRED', 409);
      return Response.json(await repo.update(job.id, { status: 'COMMITTED', result_json: { commit: body.commit || null } }));
    }

    return Response.json({ error: 'NOT_FOUND', code: 'NOT_FOUND' }, { status: 404 });
  })();
}
