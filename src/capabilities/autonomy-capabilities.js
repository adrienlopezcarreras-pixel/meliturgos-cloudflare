import { D1DevJobRepository } from '../dev/d1-dev-job-repository.js';
import { getAutonomyReadiness } from '../evolution/autonomy-readiness.js';
import { runAutonomyRuntimeTick } from '../evolution/autonomy-runtime.js';
import { getAutonomyControl, setAutonomyControl } from '../evolution/autonomy-control.js';
import { D1EvolutionLedger } from '../evolution/evolution-ledger.js';
import { isSupervisedAutonomyJob } from '../evolution/autonomy-supervisor.js';

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
    const [readiness, control] = await Promise.all([
      getAutonomyReadiness({ repository: new D1DevJobRepository(env.DB) }),
      getAutonomyControl(env.DB),
    ]);
    return { ...readiness, control };
  });

  bus.discover({
    id: 'autonomy.activity',
    name: 'Activité autonome réelle de MEL',
    category: 'evolution',
    version: '1.0.0',
    provider: 'mel',
    description: 'Returns grounded recent supervised-autonomy activity from dev_jobs, evolution_ledger and the persisted MAX control state.',
    input_schema: {
      type: 'object',
      properties: {
        limit: { type: 'integer', minimum: 1, maximum: 50 },
      },
      additionalProperties: false,
    },
    output_schema: { type: 'object', additionalProperties: true },
    risk: 'LOW',
    permissions: [],
    health: env.DB ? 'HEALTHY' : 'DEGRADED',
    enabled: true,
  }, async (input = {}) => {
    if (!env.DB) throw capabilityError('DB_BINDING_MISSING');
    const repository = new D1DevJobRepository(env.DB);
    const limit = Math.max(1, Math.min(50, Number(input.limit) || 12));
    const [allJobs, control, ledgerRows] = await Promise.all([
      repository.list(),
      getAutonomyControl(env.DB),
      new D1EvolutionLedger(env.DB).list({ limit: 2000 }),
    ]);
    const jobs = allJobs.filter(isSupervisedAutonomyJob);
    const ids = new Set(jobs.map(job => String(job.id || '')));
    const counts = {};
    for (const job of jobs) {
      const status = String(job.status || 'UNKNOWN').toUpperCase();
      counts[status] = (counts[status] || 0) + 1;
    }
    const recentJobs = [...jobs]
      .sort((a, b) => Number(b.updated_at || 0) - Number(a.updated_at || 0))
      .slice(0, limit)
      .map(job => ({
        job_id: job.id,
        requested_by: job.requested_by,
        status: job.status,
        goal: String(job.goal || '').slice(0, 320),
        roadmap_id: job.optional_context?.roadmap_id || null,
        updated_at: Number(job.updated_at || 0),
        teacher_verdict: job.result_json?.teacher_bridge?.review?.verdict || null,
        owner_override: job.result_json?.teacher_bridge?.review?.owner_override === true,
        implementation_status: job.result_json?.implementation_proposal?.status || null,
        bridge_preparation_status: job.result_json?.bridge_preparation?.status || null,
        completion_status: job.result_json?.autonomy_completion?.status || null,
        completion_sha: job.result_json?.autonomy_completion?.candidate_sha || null,
        ci_run_id: job.result_json?.autonomy_completion?.ci?.run_id || null,
        error: job.error ? String(job.error).slice(0, 240) : null,
      }));
    const recentEvents = ledgerRows
      .filter(row => ids.has(String(row.evolution_id || '')) || String(row.actor || '') === 'mel-autonomy')
      .sort((a, b) => Number(b.seq || 0) - Number(a.seq || 0))
      .slice(0, Math.max(limit * 4, 24))
      .map(row => ({
        seq: row.seq,
        evolution_id: row.evolution_id,
        stage: row.stage,
        status: row.status,
        actor: row.actor,
        source_sha: row.source_sha || null,
        branch: row.branch || null,
        occurred_at: row.occurred_at,
        evidence: row.evidence || {},
      }));
    return {
      ok: true,
      observed_at: new Date().toISOString(),
      control,
      counts: {
        supervised_total: jobs.length,
        by_status: counts,
        mel_autonomy: jobs.filter(job => job.requested_by === 'mel-autonomy').length,
        owner_chat: jobs.filter(job => String(job.requested_by || '').startsWith('owner-chat')).length,
      },
      recent_jobs: recentJobs,
      recent_events: recentEvents,
      sources: ['dev_jobs', 'dev_bridge_state:mel-autonomy-control', 'evolution_ledger'],
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
  }, async () => {
    if (!env.DB) throw capabilityError('DB_BINDING_MISSING');
    if (!env.AI || typeof env.AI.run !== 'function') throw capabilityError('AI_BINDING_MISSING');
    const repository = new D1DevJobRepository(env.DB);
    return runAutonomyRuntimeTick(env, {
      repository,
      fetchImpl: env.MEL_GITHUB_FETCH || fetch,
    });
  });

  return bus;
}
