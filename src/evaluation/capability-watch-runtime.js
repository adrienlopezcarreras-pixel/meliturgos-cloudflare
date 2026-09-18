import { migrate } from '../persistence/migrations.js';
import { createGen2Runtime } from '../core/orchestrator/gen2-runtime.js';
import { runPersistedCapabilityWatch, normalizeCapabilityWatchState } from './capability-watch.js';
import {
  ECOSYSTEM_WATCH_INTERVAL_MS,
  ECOSYSTEM_WATCH_TARGETS,
  getEcosystemWatchCatalog,
} from './ecosystem-watch-catalog.js';

const WATCH_ID = 'ecosystem-canonical';

function busContext(env) {
  return {
    owner: env.MELITURGOS_USER || 'owner',
    permissions: env.CAPABILITY_PERMISSIONS || [],
    requestId: crypto.randomUUID(),
  };
}

async function ensureStore(env) {
  if (!env?.DB) {
    throw Object.assign(new Error('CAPABILITY_WATCH_DB_REQUIRED'), { code: 'CAPABILITY_WATCH_DB_REQUIRED' });
  }
  await migrate(env.DB);
  return {
    async load() {
      const row = await env.DB.prepare(
        'SELECT state_json FROM capability_watch_state WHERE id = ?'
      ).bind(WATCH_ID).first();
      if (!row?.state_json) return {};
      try { return JSON.parse(row.state_json); } catch { return {}; }
    },
    async save(state) {
      await env.DB.prepare(
        `INSERT INTO capability_watch_state(id,state_json,updated_at) VALUES(?,?,?)
         ON CONFLICT(id) DO UPDATE SET state_json=excluded.state_json,updated_at=excluded.updated_at`
      ).bind(WATCH_ID, JSON.stringify(state), Date.now()).run();
    },
  };
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
  { now = Date.now(), sourceSha = null } = {},
) {
  const store = await ensureStore(env);
  return runPersistedCapabilityWatch({
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
}

export async function getEcosystemCapabilityWatchStatus(env) {
  const store = await ensureStore(env);
  const state = normalizeCapabilityWatchState(await store.load());
  return {
    ok: true,
    catalog: getEcosystemWatchCatalog(),
    state,
  };
}
