import { migrate } from '../persistence/migrations.js';
import { createGen2Runtime } from '../core/orchestrator/gen2-runtime.js';
import { runPersistedCapabilityWatch, normalizeCapabilityWatchState } from './capability-watch.js';
import {
  ECOSYSTEM_WATCH_INTERVAL_MS,
  ECOSYSTEM_WATCH_TARGETS,
  getEcosystemWatchCatalog,
} from './ecosystem-watch-catalog.js';
import { planEcosystemDiscoveries, mergeEcosystemDiscoveryLedger, selectEcosystemDiscoveryCandidate, markEcosystemDiscoveryHandoff, reconcileEcosystemDiscoveryHandoffs } from './ecosystem-discovery-planner.js';
import { enqueueSupervisedDevelopmentRequest } from '../evolution/owner-development-queue.js';
import { D1DevJobRepository } from '../dev/d1-dev-job-repository.js';

const WATCH_ID = 'ecosystem-canonical';
const DISCOVERY_ID = 'ecosystem-discoveries-canonical';

function busContext(env) {
  return {
    owner: env.MELITURGOS_USER || 'owner',
    permissions: env.CAPABILITY_PERMISSIONS || [],
    requestId: crypto.randomUUID(),
  };
}

async function ensureStore(env, id = WATCH_ID) {
  if (!env?.DB) {
    throw Object.assign(new Error('CAPABILITY_WATCH_DB_REQUIRED'), { code: 'CAPABILITY_WATCH_DB_REQUIRED' });
  }
  await migrate(env.DB);
  return {
    async load() {
      const row = await env.DB.prepare(
        'SELECT state_json FROM capability_watch_state WHERE id = ?'
      ).bind(id).first();
      if (!row?.state_json) return {};
      try { return JSON.parse(row.state_json); } catch { return {}; }
    },
    async save(state) {
      await env.DB.prepare(
        `INSERT INTO capability_watch_state(id,state_json,updated_at) VALUES(?,?,?)
         ON CONFLICT(id) DO UPDATE SET state_json=excluded.state_json,updated_at=excluded.updated_at`
      ).bind(id, JSON.stringify(state), Date.now()).run();
    },
  };
}

async function reconcileDiscoveryJobs(env, ledger, { repository = null, now = Date.now() } = {}) {
  const jobIds = [...new Set(
    (Array.isArray(ledger?.items) ? ledger.items : [])
      .map(item => String(item?.handoff?.job_id || ''))
      .filter(Boolean)
  )];
  if (!jobIds.length) return { changed: false, ledger };
  const repo = repository || new D1DevJobRepository(env?.DB);
  const jobs = [];
  for (const id of jobIds.slice(0, 50)) {
    try {
      const job = await repo.get(id);
      if (job) jobs.push(job);
    } catch {
      // Keep the last known handoff state if D1 is temporarily unavailable.
    }
  }
  return reconcileEcosystemDiscoveryHandoffs(ledger, jobs, now);
}

function watchEvaluator(env) {
  return async ({ target }) => {
    const started = Date.now();
    const query = String(target?.metadata?.query || '').trim();
    if (!query) {
      return {
        latency_ms: Date.now() - started,
        evidence: {
          status: 'NO_QUERY',
          summary: 'Aucune requête de veille configurée.',
          citations_count: 0,
          sources: [],
        },
      };
    }

    try {
      const runtime = createGen2Runtime({ env });
      const research = await runtime.bus.execute(
        'web.research',
        { query, depth: 2 },
        busContext(env),
      );
      return {
        latency_ms: Date.now() - started,
        evidence: {
          status: 'OBSERVED',
          summary: research?.summary || '',
          citations_count: research?.citations_count || 0,
          sources: Array.isArray(research?.sources)
            ? research.sources.slice(0, 5).map(source => ({
                title: source?.title || '',
                url: source?.url || '',
              }))
            : [],
          performed_at: research?.provenance?.query_performed_at || new Date().toISOString(),
        },
      };
    } catch (error) {
      return {
        latency_ms: Date.now() - started,
        evidence: {
          status: 'DEGRADED',
          summary: `Veille indisponible: ${String(error?.code || error?.message || 'UNKNOWN').slice(0, 180)}`,
          citations_count: 0,
          sources: [],
          performed_at: new Date().toISOString(),
        },
      };
    }
  };
}

export async function runEcosystemCapabilityWatch(
  env,
  {
    now = Date.now(),
    sourceSha = null,
    developmentEnqueue = enqueueSupervisedDevelopmentRequest,
    developmentRepository = null,
    fetchImpl = fetch,
  } = {},
) {
  const store = await ensureStore(env, WATCH_ID);
  const result = await runPersistedCapabilityWatch({
    store,
    now,
    intervalMs: ECOSYSTEM_WATCH_INTERVAL_MS,
    targets: ECOSYSTEM_WATCH_TARGETS,
    evaluator: watchEvaluator(env),
    source_sha: sourceSha,
    metadata: {
      watch: 'multi-ai-plugins-arts',
      zero_euro: true,
      discovery_only: true,
    },
  });

  const discoveryStore = await ensureStore(env, DISCOVERY_ID);
  let discoveryLedger = await discoveryStore.load();
  const reconciled = await reconcileDiscoveryJobs(env, discoveryLedger, {
    repository: developmentRepository,
    now,
  });
  if (reconciled.changed) {
    discoveryLedger = reconciled.ledger;
    await discoveryStore.save(discoveryLedger);
  }
  let discoveryPlan = null;
  if (result.status === 'RAN') {
    const runtime = createGen2Runtime({ env });
    discoveryPlan = planEcosystemDiscoveries({
      watchResult: result,
      catalog: getEcosystemWatchCatalog(),
      capabilities: runtime.bus.list(),
    });
    discoveryLedger = mergeEcosystemDiscoveryLedger(discoveryLedger, discoveryPlan, now);
    await discoveryStore.save(discoveryLedger);
  }

  let handoff = null;
  if (result.status === 'RAN' && discoveryLedger?.items?.length) {
    const candidate = selectEcosystemDiscoveryCandidate(discoveryLedger);
    if (candidate) {
      try {
        const runtime = createGen2Runtime({ env });
        const queued = await developmentEnqueue({
          env,
          goal: candidate.goal,
          requestKey: candidate.fingerprint,
          repository: developmentRepository,
          fetchImpl,
          capabilities: runtime.bus.list(),
          requestedBy: 'mel-autonomy',
          source: 'ecosystem-watch',
          priority: 'P1',
          extensionKind: candidate.action === 'UNBLOCK_EXISTING' ? 'plugin' : candidate.suggested_kind,
          allowBlockedExisting: candidate.action === 'UNBLOCK_EXISTING',
          targetCapabilityId: candidate.best_match?.id || '',
          evidence: {
            fingerprint: candidate.fingerprint,
            capability_hint: candidate.capability_hint,
            citations_count: candidate.citations_count,
            observed_on: candidate.observed_on,
            sources: candidate.sources,
            source_watch_sha: discoveryPlan?.source_watch_sha || sourceSha,
          },
          roadmapId: candidate.roadmap_id,
          inspectionPaths: candidate.inspection_paths,
          inspectionQueries: candidate.inspection_queries,
        });
        handoff = {
          fingerprint: candidate.fingerprint,
          action: candidate.action,
          status: queued?.status || 'QUEUED',
          job_id: queued?.job_id || null,
          teacher_request_id: queued?.teacher?.request_id || null,
          created: queued?.created === true,
          closed: queued?.job_id == null && ['REUSE_EXISTING', 'REVIEW_EXISTING'].includes(String(queued?.status || '')),
        };
      } catch (error) {
        handoff = {
          fingerprint: candidate.fingerprint,
          action: candidate.action,
          status: 'FAILED',
          job_id: null,
          teacher_request_id: null,
          created: false,
          closed: false,
          code: String(error?.code || error?.message || 'ECOSYSTEM_DISCOVERY_HANDOFF_FAILED').slice(0, 180),
        };
      }
      discoveryLedger = markEcosystemDiscoveryHandoff(discoveryLedger, candidate.fingerprint, handoff, now);
      await discoveryStore.save(discoveryLedger);
    }
  }

  return {
    ...result,
    discoveries: {
      plan: discoveryPlan,
      ledger: discoveryLedger,
      handoff,
    },
  };
}

export async function getEcosystemCapabilityWatchStatus(env) {
  const store = await ensureStore(env, WATCH_ID);
  const discoveryStore = await ensureStore(env, DISCOVERY_ID);
  const state = normalizeCapabilityWatchState(await store.load());
  let discoveries = await discoveryStore.load();
  const reconciled = await reconcileDiscoveryJobs(env, discoveries, { now: Date.now() });
  if (reconciled.changed) {
    discoveries = reconciled.ledger;
    await discoveryStore.save(discoveries);
  }
  return {
    ok: true,
    catalog: getEcosystemWatchCatalog(),
    state,
    discoveries,
  };
}
