import { D1DevJobRepository } from '../dev/d1-dev-job-repository.js';
import { getAutonomyReadiness } from '../evolution/autonomy-readiness.js';
import { runAutonomyRuntimeTick } from '../evolution/autonomy-runtime.js';
import { getAutonomyControl, setAutonomyControl } from '../evolution/autonomy-control.js';
import { applyOwnerMaxAutonomy } from '../evolution/autonomy-api.js';
import { D1EvolutionLedger } from '../evolution/evolution-ledger.js';
import { buildAutonomyActivity } from '../evolution/autonomy-activity.js';

function capabilityError(message, code = message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

export function registerAutonomyCapabilities(bus, env = {}) {
  if (!bus || typeof bus.discover !== 'function') throw new TypeError('CAPABILITY_BUS_REQUIRED');

  bus.discover({
    id: 'autonomy.status',
    name: 'État d’autonomie MEL',
    category: 'evolution',
    version: '1.1.0',
    provider: 'mel',
    description: 'Calculates SELF_DEVELOPMENT_READY and returns the persisted autonomy control state.',
    input_schema: { type: 'object', additionalProperties: false },
    output_schema: { type: 'object', additionalProperties: true },
    risk: 'LOW',
    permissions: [],
    health: env.DB ? 'HEALTHY' : 'DEGRADED',
    enabled: true,
  }, async () => {
    if (!env.DB) throw capabilityError('DB_BINDING_MISSING');
    const [readiness, control, activity] = await Promise.all([
      getAutonomyReadiness({ repository: new D1DevJobRepository(env.DB) }),
      getAutonomyControl(env.DB),
      buildAutonomyActivity(env, { limit: 10 }).catch(() => null),
    ]);
    // What MAX is doing right now, so answers come from facts, not imagination.
    const terminal = new Set(['COMPLETED', 'COMMITTED', 'FAILED', 'CANCELLED']);
    const work = activity ? {
      watchdog: activity.watchdog ? {
        status: activity.watchdog.status || null,
        tripped: activity.watchdog.tripped === true,
        consecutive_stalls: activity.watchdog.consecutive_stalls ?? null,
        last_block_reason: activity.watchdog.last_block_reason || null,
        last_tick_at: activity.watchdog.last_tick_at || null,
      } : null,
      active_jobs: activity.jobs.filter(job => !terminal.has(job.status)).slice(0, 3).map(job => ({
        id: job.id, status: job.status, status_text: job.status_text, origin: job.origin,
        goal: String(job.goal || '').slice(0, 200), idle_minutes: job.idle_minutes,
        current_step: (job.pipeline.find(step => step.state !== 'done') || {}).label || null,
        done_steps: job.pipeline.filter(step => step.state === 'done').map(step => step.label),
        diagnostics: job.diagnostics, error: job.error,
      })),
      last_cloud_bridge_dispatch: activity.cloud_bridge_dispatches[0] || null,
    } : null;
    return { ...readiness, control, work };
  });

  bus.discover({
    id: 'autonomy.bridge.status',
    name: 'État réel du Dev Bridge MEL',
    category: 'evolution',
    version: '1.0.0',
    provider: 'mel',
    description: 'Reads the live local Dev Bridge heartbeat, autonomy lease and bridge-ready/claimed/repair jobs from production D1.',
    input_schema: {
      type: 'object',
      properties: { limit: { type: 'integer', minimum: 1, maximum: 50 } },
      additionalProperties: false,
    },
    output_schema: { type: 'object', additionalProperties: true },
    risk: 'LOW',
    permissions: [],
    health: env.DB ? 'HEALTHY' : 'DEGRADED',
    enabled: true,
  }, async (input = {}) => {
    if (!env.DB) throw capabilityError('DB_BINDING_MISSING');
    const limit = Math.max(1, Math.min(50, Number(input.limit) || 20));
    const repository = new D1DevJobRepository(env.DB);
    const jobs = await repository.list();
    const stateRows = ((await env.DB.prepare(
      'SELECT bridge_id,last_seen,status,metadata_json FROM dev_bridge_state ORDER BY bridge_id'
    ).all())?.results || []);
    const now = Date.now();
    const summarizeState = (row) => {
      const lastSeen = Number(row?.last_seen || 0);
      const age = lastSeen > 0 ? Math.max(0, now - lastSeen) : null;
      return {
        bridge_id: String(row?.bridge_id || ''),
        status: String(row?.status || 'UNKNOWN'),
        last_seen: lastSeen || null,
        age_ms: age,
        online_60s: age != null && age < 60000 && String(row?.status || '').toUpperCase() === 'ONLINE',
      };
    };
    const states = stateRows.map(summarizeState);
    const primary = states.find(row => row.bridge_id === 'primary') || {
      bridge_id: 'primary',
      status: 'MISSING',
      last_seen: null,
      age_ms: null,
      online_60s: false,
    };
    const lease = states.find(row => row.bridge_id === 'runtime-lease:autonomy-heartbeat') || null;
    const rows = (Array.isArray(jobs) ? jobs : []).map(job => {
      const result = job?.result_json && typeof job.result_json === 'object' ? job.result_json : {};
      return {
        job_id: String(job?.id || ''),
        status: String(job?.status || 'UNKNOWN').toUpperCase(),
        requested_by: String(job?.requested_by || ''),
        updated_at: Number(job?.updated_at || 0),
        goal: String(job?.goal || '').slice(0, 220),
        teacher_verdict: result?.teacher_bridge?.review?.verdict || null,
        owner_override: result?.teacher_bridge?.review?.owner_override === true,
        implementation_status: result?.implementation_proposal?.status || null,
        bridge_preparation_status: result?.bridge_preparation?.status || null,
        candidate_branch: result?.bridge_preparation?.candidate_branch || job?.candidate_branch || null,
        candidate_sha: result?.bridge_preparation?.candidate_sha || null,
        dev_bridge_status: result?.dev_bridge?.status || null,
        needs_repair: result?.dev_bridge?.needs_repair === true,
        error: job?.error ? String(job.error).slice(0, 220) : null,
      };
    }).sort((a, b) => b.updated_at - a.updated_at);
    const ready = rows.filter(row => row.status === 'TEACHER_APPROVED' && row.bridge_preparation_status === 'READY');
    const claimed = rows.filter(row => row.status === 'CLAIMED');
    const repair = rows.filter(row => row.status === 'REPAIR_REQUIRED');
    const review = rows.filter(row => row.status === 'READY_FOR_REVIEW');
    return {
      ok: true,
      observed_at: new Date(now).toISOString(),
      source: 'production_d1',
      local_bridge: primary,
      autonomy_lease: lease,
      counts: {
        ready: ready.length,
        claimed: claimed.length,
        repair_required: repair.length,
        ready_for_review: review.length,
      },
      ready_packages: ready.slice(0, limit),
      claimed_jobs: claimed.slice(0, limit),
      repair_jobs: repair.slice(0, limit),
      review_jobs: review.slice(0, limit),
      local_polling_effective: primary.online_60s === true,
    };
  });

  bus.discover({
    id: 'autonomy.activity',
    name: 'Activité autonome récente de MEL',
    category: 'evolution',
    version: '1.0.0',
    provider: 'mel',
    description: 'Reads live autonomy control, recent supervised jobs and recent immutable evolution-ledger events.',
    input_schema: {
      type: 'object',
      properties: { limit: { type: 'integer', minimum: 1, maximum: 100 } },
      additionalProperties: false,
    },
    output_schema: { type: 'object', additionalProperties: true },
    risk: 'LOW',
    permissions: [],
    health: env.DB ? 'HEALTHY' : 'DEGRADED',
    enabled: true,
  }, async (input = {}) => {
    if (!env.DB) throw capabilityError('DB_BINDING_MISSING');
    const limit = Math.max(1, Math.min(100, Number(input.limit) || 30));
    const repository = new D1DevJobRepository(env.DB);
    const ledger = new D1EvolutionLedger(env.DB);
    const [control, allJobs, recentLedger] = await Promise.all([
      getAutonomyControl(env.DB),
      repository.list(),
      ledger.listRecent({ limit: Math.min(500, limit * 5) }),
    ]);
    const supervised = (Array.isArray(allJobs) ? allJobs : [])
      .filter(job => {
        const requester = String(job?.requested_by || '').toLowerCase();
        return requester === 'mel-autonomy' || requester.startsWith('owner-chat');
      })
      .sort((a, b) => Number(b?.updated_at || 0) - Number(a?.updated_at || 0));
    const ids = new Set(supervised.map(job => String(job?.id || '')));
    const byStatus = {};
    for (const job of supervised) {
      const status = String(job?.status || 'UNKNOWN').toUpperCase();
      byStatus[status] = (byStatus[status] || 0) + 1;
    }
    const jobs = supervised.slice(0, limit).map(job => {
      const result = job?.result_json && typeof job.result_json === 'object' ? job.result_json : {};
      return {
        job_id: String(job?.id || ''),
        status: String(job?.status || 'UNKNOWN'),
        requested_by: String(job?.requested_by || ''),
        goal: String(job?.goal || '').slice(0, 260),
        roadmap_id: job?.optional_context?.roadmap_id || null,
        created_at: Number(job?.created_at || 0),
        updated_at: Number(job?.updated_at || 0),
        candidate_branch: job?.candidate_branch || result?.bridge_preparation?.candidate_branch || null,
        teacher_verdict: result?.teacher_bridge?.review?.verdict || result?.last_teacher_review?.verdict || null,
        owner_override: result?.teacher_bridge?.review?.owner_override === true,
        implementation_status: result?.implementation_proposal?.status || null,
        bridge_preparation_status: result?.bridge_preparation?.status || null,
        completion_status: result?.autonomy_completion?.status || null,
        completion_sha: result?.autonomy_completion?.candidate_sha || null,
        completion_ci_run_id: Number(result?.autonomy_completion?.ci?.run_id || 0) || null,
        error: job?.error ? String(job.error).slice(0, 220) : null,
      };
    });
    const events = (Array.isArray(recentLedger) ? recentLedger : [])
      .filter(event => ids.has(String(event?.evolution_id || ''))
        || String(event?.actor || '').toLowerCase() === 'mel-autonomy'
        || String(event?.actor || '').toLowerCase().startsWith('owner-chat'))
      .slice(0, limit)
      .map(event => ({
        seq: Number(event?.seq || 0),
        evolution_id: String(event?.evolution_id || ''),
        stage: String(event?.stage || ''),
        status: String(event?.status || ''),
        actor: String(event?.actor || ''),
        source_sha: String(event?.source_sha || '') || null,
        branch: String(event?.branch || '') || null,
        occurred_at: Number(event?.occurred_at || 0),
        evidence: event?.evidence && typeof event.evidence === 'object' ? event.evidence : {},
      }));
    return {
      ok: true,
      observed_at: new Date().toISOString(),
      source: 'production_d1',
      control: {
        paused: control?.paused === true,
        max_autonomy: control?.max_autonomy === true,
        mode: control?.mode || null,
        reason: control?.reason || null,
        updated_at: control?.updated_at || null,
        launch_approved_sha: control?.launch_approved_sha || null,
      },
      counts: {
        supervised_total: supervised.length,
        by_status: byStatus,
        recent_jobs_returned: jobs.length,
        recent_events_returned: events.length,
      },
      recent_jobs: jobs,
      recent_events: events,
    };
  });

  bus.discover({
    id: 'autonomy.pause',
    name: 'Pause d’urgence MEL',
    category: 'evolution',
    version: '1.0.0',
    provider: 'mel',
    description: 'Immediately pauses future autonomous development heartbeats while keeping normal MEL chat available.',
    input_schema: { type: 'object', properties: { reason: { type: 'string' } }, additionalProperties: false },
    output_schema: { type: 'object', additionalProperties: true },
    risk: 'LOW',
    permissions: [],
    health: env.DB ? 'HEALTHY' : 'DEGRADED',
    enabled: true,
  }, async (input = {}) => {
    if (!env.DB) throw capabilityError('DB_BINDING_MISSING');
    return setAutonomyControl(env.DB, { paused: true, source: 'mel-capability', reason: input.reason || 'owner-request' });
  });

  bus.discover({
    id: 'autonomy.resume',
    name: 'Reprise d’autonomie MEL',
    category: 'evolution',
    version: '1.0.0',
    provider: 'mel',
    description: 'Resumes future autonomous development heartbeats after an explicit owner request.',
    input_schema: { type: 'object', additionalProperties: false },
    output_schema: { type: 'object', additionalProperties: true },
    risk: 'MEDIUM',
    permissions: [],
    health: env.DB ? 'HEALTHY' : 'DEGRADED',
    enabled: true,
  }, async () => {
    if (!env.DB) throw capabilityError('DB_BINDING_MISSING');
    return setAutonomyControl(env.DB, { paused: false, source: 'mel-capability', reason: 'owner-resume' });
  });

  bus.discover({
    id: 'autonomy.max',
    name: 'Activation propriétaire du mode MAX',
    category: 'evolution',
    version: '1.0.0',
    provider: 'mel',
    description: 'Activates MAX only after the existing exact-SHA launch gate, then runs a real bounded autonomy tick. Does not bypass a release pause.',
    input_schema: {
      type: 'object',
      properties: { enabled: { type: 'boolean' } },
      additionalProperties: false,
    },
    output_schema: { type: 'object', additionalProperties: true },
    risk: 'MEDIUM',
    permissions: [],
    health: env.DB ? 'HEALTHY' : 'DEGRADED',
    enabled: true,
  }, async (input = {}) => {
    if (!env.DB) throw capabilityError('DB_BINDING_MISSING');
    return applyOwnerMaxAutonomy(env, {
      enabled: input.enabled !== false,
      repository: new D1DevJobRepository(env.DB),
      fetchImpl: env.MEL_GITHUB_FETCH || fetch,
      source: 'owner-chat-launch-gate',
    });
  });

  bus.discover({
    id: 'autonomy.tick',
    name: 'Cycle autonome MEL',
    category: 'evolution',
    version: '1.1.0',
    provider: 'mel',
    description: 'Runs one bounded supervised-autonomy heartbeat unless the persisted emergency pause is active.',
    input_schema: { type: 'object', additionalProperties: false },
    output_schema: { type: 'object', additionalProperties: true },
    risk: 'MEDIUM',
    permissions: [],
    health: env.DB && env.AI ? 'HEALTHY' : 'DEGRADED',
    enabled: true,
  }, async (_input, context = {}) => {
    if (!env.DB) throw capabilityError('DB_BINDING_MISSING');
    if (!env.AI || typeof env.AI.run !== 'function') throw capabilityError('AI_BINDING_MISSING');
    const repository = new D1DevJobRepository(env.DB);
    return runAutonomyRuntimeTick(env, {
      repository,
      fetchImpl: env.MEL_GITHUB_FETCH || fetch,
      ...(typeof context?.waitUntil === 'function' ? { waitUntil: context.waitUntil } : {}),
    });
  });

  return bus;
}
