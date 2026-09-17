const BAD_CAPABILITY_STATES = new Set(['ERROR', 'FAILED', 'FAIL', 'DOWN', 'UNHEALTHY', 'BROKEN']);
const UNKNOWN_CAPABILITY_STATES = new Set(['UNKNOWN', 'UNTESTED', 'NOT_TESTED']);

function countHealth(health, matcher) {
  return Object.entries(health || {}).reduce((total, [state, count]) => {
    return matcher(String(state || '').toUpperCase()) ? total + Math.max(0, Number(count) || 0) : total;
  }, 0);
}

function component(id, label, status, detail, evidence = {}) {
  return { id, label, status, detail, evidence };
}

/**
 * Build a non-secret, deterministic health dashboard from the readiness
 * snapshot. This function is pure: it performs no network calls or writes.
 */
export function buildHealthDashboard({
  readiness = {},
  bindings = {},
  selfCode = {},
  critical = {},
  capabilities = {},
  models = {},
  blockers = [],
  now = new Date(),
} = {}) {
  const criticalFailures = Object.entries(critical)
    .filter(([, value]) => value !== true)
    .map(([id]) => id)
    .sort();

  const missingBindings = Object.entries(bindings)
    .filter(([key, value]) => key !== 'github_branch' && value !== true)
    .map(([key]) => key)
    .sort();

  const failedCapabilities = countHealth(capabilities.health, state => BAD_CAPABILITY_STATES.has(state));
  const unknownCapabilities = countHealth(capabilities.health, state => UNKNOWN_CAPABILITY_STATES.has(state));
  const totalCapabilities = Math.max(0, Number(capabilities.total) || 0);
  const zeroCostCatalogModels = Math.max(0, Number(models.explicit_zero_cost) || 0);
  const configuredModels = Math.max(0, Number(models.configured) || 0);
  const runtimeZeroCost = models.runtime_zero_cost && typeof models.runtime_zero_cost === 'object'
    ? models.runtime_zero_cost
    : null;
  const authorizedZeroCost = Math.max(0, Number(runtimeZeroCost?.authorized_zero_cost_count) || 0);
  const runtimeMinimum = Math.max(1, Number(runtimeZeroCost?.minimum) || 2);
  const runtimeQuorumReady = runtimeZeroCost?.status === 'ONLINE' && authorizedZeroCost >= runtimeMinimum;
  const exactDeploymentIdentity = selfCode.exact_identity_known === true;
  const blockerCount = Array.isArray(blockers) ? blockers.length : 0;

  const components = [
    component(
      'readiness',
      'Readiness critique',
      readiness.state === 'READY' ? 'OK' : readiness.state === 'DEGRADED' ? 'ERROR' : 'WARN',
      `${Number(readiness.percent) || 0}% des invariants critiques prêts`,
      { ready: Number(readiness.critical_ready) || 0, total: Number(readiness.critical_total) || 0 }
    ),
    component(
      'bindings',
      'Bindings runtime',
      missingBindings.length === 0 ? 'OK' : 'WARN',
      missingBindings.length === 0 ? 'Bindings requis présents' : `${missingBindings.length} binding(s) absent(s)`,
      { missing: missingBindings }
    ),
    component(
      'capabilities',
      'Capability Bus',
      failedCapabilities > 0 ? 'ERROR' : unknownCapabilities > 0 ? 'WARN' : totalCapabilities > 0 ? 'OK' : 'UNKNOWN',
      failedCapabilities > 0
        ? `${failedCapabilities} capacité(s) en échec`
        : unknownCapabilities > 0
          ? `${unknownCapabilities} capacité(s) sans état confirmé`
          : `${totalCapabilities} capacité(s) recensée(s)`,
      { total: totalCapabilities, failed: failedCapabilities, unknown: unknownCapabilities }
    ),
    component(
      'models',
      'Multi-IA zéro-euro',
      runtimeQuorumReady ? 'OK' : configuredModels > 0 ? 'WARN' : 'UNKNOWN',
      runtimeQuorumReady
        ? `${authorizedZeroCost} fournisseur(s) runtime autorisé(s), quorum ${runtimeMinimum} atteint`
        : `${authorizedZeroCost} fournisseur(s) runtime autorisé(s) sur quorum ${runtimeMinimum}; ${zeroCostCatalogModels} modèle(s) seulement catalogué(s) coût 0`,
      {
        configured: configuredModels,
        explicit_zero_cost_catalog: zeroCostCatalogModels,
        authorized_zero_cost_runtime: authorizedZeroCost,
        runtime_minimum: runtimeMinimum,
        runtime_status: runtimeZeroCost?.status || 'UNKNOWN',
        runtime_reason: runtimeZeroCost?.reason || null,
      }
    ),
    component(
      'deployment',
      'Identité du déploiement',
      exactDeploymentIdentity ? 'OK' : 'WARN',
      exactDeploymentIdentity ? 'Branche et commit exacts connus' : 'Identité exacte du déploiement incomplète',
      {
        branch_known: selfCode.branch_known === true,
        commit_known: selfCode.commit_known === true,
        exact_identity_known: exactDeploymentIdentity,
      }
    ),
    component(
      'roadmap',
      'Blocages roadmap',
      blockerCount === 0 ? 'OK' : 'WARN',
      blockerCount === 0 ? 'Aucun blocage humain/externe déclaré' : `${blockerCount} blocage(s) humain(s) ou externe(s)`,
      { count: blockerCount }
    ),
  ];

  const alerts = [];
  if (criticalFailures.length) alerts.push({ severity: 'ERROR', code: 'CRITICAL_NOT_READY', items: criticalFailures });
  if (failedCapabilities) alerts.push({ severity: 'ERROR', code: 'CAPABILITY_FAILURES', count: failedCapabilities });
  if (missingBindings.length) alerts.push({ severity: 'WARN', code: 'MISSING_BINDINGS', items: missingBindings });
  if (unknownCapabilities) alerts.push({ severity: 'WARN', code: 'CAPABILITY_HEALTH_UNKNOWN', count: unknownCapabilities });
  if (!exactDeploymentIdentity) alerts.push({ severity: 'WARN', code: 'DEPLOYMENT_IDENTITY_INCOMPLETE' });
  if (blockerCount) alerts.push({ severity: 'INFO', code: 'ROADMAP_BLOCKERS', count: blockerCount });

  const statusCounts = components.reduce((acc, row) => {
    acc[row.status] = (acc[row.status] || 0) + 1;
    return acc;
  }, { OK: 0, WARN: 0, ERROR: 0, UNKNOWN: 0 });

  const state = statusCounts.ERROR > 0
    ? 'ERROR'
    : statusCounts.WARN > 0 || statusCounts.UNKNOWN > 0
      ? 'WARN'
      : 'OK';

  const generatedAt = now instanceof Date ? now : new Date(now);
  return {
    ok: state !== 'ERROR',
    state,
    generated_at: Number.isNaN(generatedAt.getTime()) ? null : generatedAt.toISOString(),
    summary: {
      components: components.length,
      ...statusCounts,
      critical_failures: criticalFailures.length,
      alerts: alerts.length,
    },
    components,
    alerts,
  };
}
