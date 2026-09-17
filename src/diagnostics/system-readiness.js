import { createGen2Runtime } from '../core/orchestrator/gen2-runtime.js';
import { standardRegistry } from '../models/ModelRegistry.js';
import { roadmapSummary, flattenRoadmap } from '../roadmap/master-roadmap.js';
import { buildHealthDashboard } from './health-dashboard.js';
import { inspectZeroCostProviderReadiness } from '../augmentio/zero-cost-readiness.js';

function costIsExplicitZero(model) {
  return model?.cost !== null && model?.cost !== undefined && model?.cost !== '' && Number(model.cost) === 0;
}

function blockersFromRoadmap() {
  return flattenRoadmap()
    .filter(row => row.status === 'BLOCKED_HUMAN' || row.status === 'BLOCKED_EXTERNAL')
    .map(row => ({ id: row.id, title: row.title, status: row.status, next: row.next }));
}

function nonEmptyString(value) {
  const text = String(value ?? '').trim();
  return text || null;
}

function exactGitSha(value) {
  const sha = nonEmptyString(value)?.toLowerCase() || null;
  return sha && /^[0-9a-f]{40}$/.test(sha) ? sha : null;
}

function deploymentIdentity(env = {}) {
  const compiledBranch = typeof MEL_DEPLOYED_GIT_BRANCH !== 'undefined'
    ? nonEmptyString(MEL_DEPLOYED_GIT_BRANCH)
    : null;
  const compiledShaRaw = typeof MEL_DEPLOYED_GIT_SHA !== 'undefined'
    ? nonEmptyString(MEL_DEPLOYED_GIT_SHA)
    : null;
  const runtimeBranch = nonEmptyString(env.MEL_DEPLOYED_GIT_BRANCH);
  const runtimeShaRaw = nonEmptyString(env.MEL_DEPLOYED_GIT_SHA);
  const branch = compiledBranch || runtimeBranch;
  const commit = exactGitSha(compiledShaRaw || runtimeShaRaw);
  const source = compiledBranch || compiledShaRaw
    ? 'compile_time_define'
    : runtimeBranch || runtimeShaRaw
      ? 'runtime_env'
      : 'unavailable';

  return {
    repository: nonEmptyString(env.MEL_GITHUB_REPOSITORY) || 'adrienlopezcarreras-pixel/meliturgos-cloudflare',
    branch,
    commit,
    branch_known: Boolean(branch),
    commit_known: Boolean(commit),
    exact_identity_known: Boolean(branch && commit),
    commit_format_valid: compiledShaRaw || runtimeShaRaw ? Boolean(commit) : null,
    source,
  };
}

/**
 * Non-secret readiness snapshot. This is descriptive, not an authorization
 * mechanism: it never exposes tokens/credentials and never changes state.
 */
export async function getSystemReadiness({ env = {}, refreshHealth = false, fetchImpl } = {}) {
  const runtimeEnv = fetchImpl ? { ...env, MEL_GITHUB_FETCH: fetchImpl } : env;
  const runtime = createGen2Runtime({ env: runtimeEnv });
  const capabilities = refreshHealth ? await runtime.bus.refreshHealthAll() : runtime.bus.list();
  const models = standardRegistry.list();
  const zeroCostModels = models.filter(model => model.enabled !== false && costIsExplicitZero(model));
  const zeroCostRuntime = await inspectZeroCostProviderReadiness(runtimeEnv, {
    capability: 'GENERAL',
    minimum: 2,
    refreshHealth: true,
  });
  const roadmap = roadmapSummary();
  const blockers = blockersFromRoadmap();
  const selfCode = deploymentIdentity(env);

  const bindings = {
    ai: Boolean(env.AI && typeof env.AI.run === 'function'),
    db: Boolean(env.DB),
    media_bucket: Boolean(env.MEDIA_BUCKET),
    owner: Boolean(env.MELITURGOS_USER),
    github_repository: Boolean(env.MEL_GITHUB_REPOSITORY || 'adrienlopezcarreras-pixel/meliturgos-cloudflare'),
    github_branch: String(env.MEL_GITHUB_BRANCH || 'candidate/mel-clean-autonomy')
  };

  const health = capabilities.reduce((acc, cap) => {
    const key = String(cap.health || 'UNKNOWN');
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  const ids = new Set(capabilities.map(cap => cap.id));

  const critical = {
    conversation: true,
    memory_db: bindings.db,
    ai: bindings.ai,
    capability_bus: capabilities.length >= 18,
    code_reader_registered: ids.has('code.read') && ids.has('code.search'),
    code_integrity_registered: ids.has('code.integrity'),
    multi_ai_registered: ids.has('augmentio.fanout'),
    council_registered: ids.has('council.state-of-play') && ids.has('evolution.preflight'),
    module_proposal_registered: ids.has('evolution.gap.detect') && ids.has('evolution.module.propose'),
    persistent_work_registered: ids.has('work.create') && ids.has('work.run') && ids.has('work.open'),
    multi_ai_zero_cost_catalog_candidates: zeroCostModels.length >= 2,
    multi_ai_zero_cost_runtime_quorum: zeroCostRuntime.status === 'ONLINE' && zeroCostRuntime.authorized_zero_cost_count >= 2,
    roadmap_available: roadmap.total >= 90
  };

  const readyCount = Object.values(critical).filter(Boolean).length;
  const totalCritical = Object.keys(critical).length;
  const percent = Math.round((readyCount / totalCritical) * 100);
  const readiness = {
    critical_ready: readyCount,
    critical_total: totalCritical,
    percent,
    state: percent === 100 ? 'READY' : percent >= 70 ? 'PARTIAL' : 'DEGRADED'
  };
  const capabilitySummary = {
    total: capabilities.length,
    health,
    ids: capabilities.map(x => x.id)
  };
  const zeroCostIds = zeroCostModels.map(x => x.id);
  const modelSummary = {
    configured: models.length,
    // Compatibility aliases retained for existing consumers.
    explicit_zero_cost: zeroCostModels.length,
    zero_cost_ids: zeroCostIds,
    explicit_zero_cost_catalog: zeroCostModels.length,
    zero_cost_catalog_ids: zeroCostIds,
    unknown_or_nonzero_cost: models.filter(x => !costIsExplicitZero(x)).map(x => x.id),
    runtime_zero_cost: {
      status: zeroCostRuntime.status,
      minimum: zeroCostRuntime.minimum,
      healthy_provider_count: zeroCostRuntime.healthy_provider_count,
      authorized_zero_cost_count: zeroCostRuntime.authorized_zero_cost_count,
      authorized_provider_ids: zeroCostRuntime.authorized_provider_ids,
      reason: zeroCostRuntime.reason,
    }
  };
  const dashboard = buildHealthDashboard({
    readiness,
    bindings,
    selfCode,
    critical,
    capabilities: capabilitySummary,
    models: modelSummary,
    blockers,
  });

  return {
    ok: true,
    readiness,
    dashboard,
    bindings,
    self_code: selfCode,
    critical,
    capabilities: capabilitySummary,
    models: modelSummary,
    roadmap,
    blockers,
    invariants: {
      unknown_cost_is_not_free: true,
      catalog_zero_cost_is_not_runtime_authorization: true,
      ai_council_before_development: true,
      code_inspection_before_generation: true,
      owner_shutdown_wins: true,
      no_automatic_d1_rollback: true,
      production_activation_requires_human_approval: true,
    }
  };
}
