import { createDefaultCapabilityBus } from '../capabilities/default-bus.js';
import { standardRegistry } from '../models/ModelRegistry.js';
import { roadmapSummary, flattenRoadmap } from '../roadmap/master-roadmap.js';

function costIsExplicitZero(model) {
  return model?.cost !== null && model?.cost !== undefined && model?.cost !== '' && Number(model.cost) === 0;
}

function blockersFromRoadmap() {
  return flattenRoadmap()
    .filter(row => row.status === 'BLOCKED_HUMAN' || row.status === 'BLOCKED_EXTERNAL')
    .map(row => ({ id: row.id, title: row.title, status: row.status, next: row.next }));
}

/**
 * Non-secret readiness snapshot. This is descriptive, not an authorization
 * mechanism: it never exposes tokens/credentials and never changes state.
 */
export async function getSystemReadiness({ env = {}, refreshHealth = false, fetchImpl } = {}) {
  const bus = createDefaultCapabilityBus({ env, fetchImpl });
  const capabilities = refreshHealth ? await bus.refreshHealthAll() : bus.list();
  const models = standardRegistry.list();
  const zeroCostModels = models.filter(model => model.enabled !== false && costIsExplicitZero(model));
  const roadmap = roadmapSummary();
  const blockers = blockersFromRoadmap();

  const bindings = {
    ai: Boolean(env.AI),
    db: Boolean(env.DB),
    media_bucket: Boolean(env.MEDIA_BUCKET),
    owner: Boolean(env.MELITURGOS_USER),
    github_repository: Boolean(env.MEL_GITHUB_REPOSITORY || 'adrienlopezcarreras-pixel/meliturgos-cloudflare'),
    github_branch: String(env.MEL_GITHUB_BRANCH || 'release/mel-2026-09-10-r3')
  };

  const health = capabilities.reduce((acc, cap) => {
    const key = String(cap.health || 'UNKNOWN');
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  const critical = {
    conversation: true,
    memory_db: bindings.db,
    ai: bindings.ai,
    capability_bus: capabilities.length >= 11,
    code_reader_registered: capabilities.some(x => x.id === 'code.read') && capabilities.some(x => x.id === 'code.search'),
    multi_ai_registered: capabilities.some(x => x.id === 'augmentio.fanout'),
    council_registered: capabilities.some(x => x.id === 'council.state-of-play') && capabilities.some(x => x.id === 'evolution.preflight'),
    multi_ai_zero_cost_candidates: zeroCostModels.length >= 2,
    roadmap_available: roadmap.total >= 90
  };

  const readyCount = Object.values(critical).filter(Boolean).length;
  const totalCritical = Object.keys(critical).length;
  const percent = Math.round((readyCount / totalCritical) * 100);

  return {
    ok: true,
    readiness: {
      critical_ready: readyCount,
      critical_total: totalCritical,
      percent,
      state: percent === 100 ? 'READY' : percent >= 70 ? 'PARTIAL' : 'DEGRADED'
    },
    bindings,
    capabilities: {
      total: capabilities.length,
      health,
      ids: capabilities.map(x => x.id)
    },
    models: {
      configured: models.length,
      explicit_zero_cost: zeroCostModels.length,
      zero_cost_ids: zeroCostModels.map(x => x.id),
      unknown_or_nonzero_cost: models.filter(x => !costIsExplicitZero(x)).map(x => x.id)
    },
    roadmap,
    blockers,
    invariants: {
      unknown_cost_is_not_free: true,
      ai_council_before_development: true,
      code_inspection_before_generation: true,
      owner_shutdown_wins: true,
      no_automatic_d1_rollback: true
    }
  };
}