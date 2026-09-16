import { createGen2Runtime } from '../core/orchestrator/gen2-runtime.js';
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

function dashboardCheck(id, label, ok, detail = null, severity = 'warning') {
  return {
    id,
    label,
    ok: Boolean(ok),
    severity,
    detail: detail == null ? null : String(detail),
  };
}

function dashboardSection(id, label, checks) {
  const failed = checks.filter(check => !check.ok);
  const criticalFailed = failed.some(check => check.severity === 'critical');
  return {
    id,
    label,
    state: criticalFailed ? 'DEGRADED' : failed.length ? 'ATTENTION' : 'HEALTHY',
    ok: failed.length === 0,
    checks,
  };
}

/**
 * Stable, non-secret health model consumed by diagnostics/UI clients.
 * It aggregates existing truth instead of creating a second monitoring path.
 */
export function buildUnifiedHealthDashboard(snapshot = {}) {
  const critical = snapshot.critical || {};
  const bindings = snapshot.bindings || {};
  const selfCode = snapshot.self_code || {};
  const capabilities = snapshot.capabilities || {};
  const models = snapshot.models || {};
  const roadmap = snapshot.roadmap || {};
  const blockers = Array.isArray(snapshot.blockers) ? snapshot.blockers : [];

  const sections = [
    dashboardSection('runtime', 'Runtime', [
      dashboardCheck('conversation', 'Conversation', critical.conversation, 'service conversation', 'critical'),
      dashboardCheck('capability_bus', 'Capability Bus', critical.capability_bus, `${Number(capabilities.total || 0)} capacités`, 'critical'),
      dashboardCheck('persistent_work', 'Work persistant', critical.persistent_work_registered, 'capacités work.create/run/open', 'warning'),
    ]),
    dashboardSection('persistence', 'Persistance', [
      dashboardCheck('memory_db', 'Mémoire D1', critical.memory_db ?? bindings.db, bindings.db ? 'DB liée' : 'DB absente', 'critical'),
      dashboardCheck('media_bucket', 'Stockage média', bindings.media_bucket, bindings.media_bucket ? 'bucket lié' : 'bucket absent', 'warning'),
    ]),
    dashboardSection('intelligence', 'IA et modèles', [
      dashboardCheck('ai_binding', 'Workers AI', critical.ai ?? bindings.ai, bindings.ai ? 'binding AI présent' : 'binding AI absent', 'critical'),
      dashboardCheck('multi_ai', 'Multi-IA', critical.multi_ai_registered, 'augmentio.fanout', 'warning'),
      dashboardCheck('zero_cost_pool', 'Pool zéro coût', critical.multi_ai_zero_cost_candidates, `${Number(models.explicit_zero_cost || 0)} modèle(s) explicitement zéro coût`, 'warning'),
    ]),
    dashboardSection('code', 'Code et identité déployée', [
      dashboardCheck('code_reader', 'Lecture/recherche code', critical.code_reader_registered, 'code.read + code.search', 'critical'),
      dashboardCheck('code_integrity', 'Intégrité code', critical.code_integrity_registered, 'code.integrity', 'warning'),
      dashboardCheck('deployment_identity', 'Identité exacte du déploiement', selfCode.exact_identity_known, selfCode.exact_identity_known ? `${selfCode.branch}@${selfCode.commit}` : 'branche/SHA exact non exposé', 'warning'),
    ]),
    dashboardSection('governance', 'Roadmap et gouvernance', [
      dashboardCheck('roadmap', 'Roadmap disponible', critical.roadmap_available, `${Number(roadmap.total || 0)} éléments`, 'critical'),
      dashboardCheck('external_blockers', 'Aucun blocage externe/humain', blockers.length === 0, blockers.length ? `${blockers.length} blocage(s)` : 'aucun', 'warning'),
    ]),
  ];

  const checks = sections.flatMap(section => section.checks);
  const criticalFailures = checks.filter(check => !check.ok && check.severity === 'critical').length;
  const warnings = checks.filter(check => !check.ok && check.severity !== 'critical').length;
  const state = criticalFailures ? 'DEGRADED' : warnings ? 'ATTENTION' : 'HEALTHY';
  const alerts = sections.flatMap(section => section.checks
    .filter(check => !check.ok)
    .map(check => ({ section: section.id, id: check.id, label: check.label, severity: check.severity, detail: check.detail })));

  return {
    schema: 'mel.health-dashboard.v1',
    state,
    generated_at: new Date().toISOString(),
    summary: {
      sections: sections.length,
      checks: checks.length,
      healthy: checks.filter(check => check.ok).length,
      critical_failures: criticalFailures,
      warnings,
    },
    sections,
    alerts,
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
  const roadmap = roadmapSummary();
  const blockers = blockersFromRoadmap();
  const selfCode = deploymentIdentity(env);

  const bindings = {
    ai: Boolean(env.AI),
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
    multi_ai_zero_cost_candidates: zeroCostModels.length >= 2,
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

  const snapshot = {
    ok: true,
    readiness,
    bindings,
    self_code: selfCode,
    critical,
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
      no_automatic_d1_rollback: true,
      production_activation_requires_human_approval: true,
    }
  };

  return { ...snapshot, dashboard: buildUnifiedHealthDashboard(snapshot) };
}
