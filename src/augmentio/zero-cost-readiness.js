import { createDefaultAugmentioPool } from './default-pool.js';
import { ZeroEuroGovernor } from './zero-euro-governor.js';

function boundedMinimum(value) {
  const n = Number(value);
  return Math.max(1, Math.min(12, Number.isFinite(n) ? Math.round(n) : 1));
}

function safeProvider(provider, evaluation = {}) {
  return {
    provider_id: String(provider?.providerId || provider?.provider_id || ''),
    model_id: String(provider?.modelId || provider?.model_id || ''),
    adapter_id: String(provider?.id || ''),
    reason: String(evaluation?.code || 'ZERO_EURO_POLICY_BLOCKED'),
  };
}

/**
 * Descriptive zero-added-cost readiness for .augmentio.
 * This never authorizes a provider and never treats registry cost=0 as proof.
 * It only reports what the existing ZeroEuroGovernor would allow right now.
 */
export async function inspectZeroCostProviderReadiness(env = {}, {
  capability = 'GENERAL',
  minimum = 1,
  refreshHealth = true,
} = {}) {
  const required = boundedMinimum(minimum);
  const aiAvailable = Boolean(env?.AI && typeof env.AI.run === 'function');

  if (!aiAvailable) {
    return {
      status: 'DEGRADED',
      capability: String(capability || 'GENERAL'),
      minimum: required,
      provider_count: 0,
      healthy_provider_count: 0,
      authorized_zero_cost_count: 0,
      authorized_provider_ids: [],
      blocked: [],
      reason: 'AI_BINDING_UNAVAILABLE',
    };
  }

  const pool = createDefaultAugmentioPool(env);
  if (refreshHealth) await pool.refreshHealth();
  const governor = new ZeroEuroGovernor();
  const targetCapability = String(capability || 'GENERAL');
  const candidates = [...pool.adapters.values()]
    .filter(provider => provider?.enabled !== false)
    .filter(provider => provider?.supports?.(targetCapability));
  const healthy = candidates.filter(provider => provider.healthStatus === 'HEALTHY');
  const authorized = [];
  const blocked = [];

  for (const provider of healthy) {
    const evaluation = governor.evaluate(provider);
    if (evaluation.allowed) authorized.push(provider);
    else blocked.push(safeProvider(provider, evaluation));
  }

  const authorizedCount = authorized.length;
  const status = authorizedCount >= required ? 'ONLINE' : 'DEGRADED';
  const reason = status === 'ONLINE'
    ? 'ZERO_EURO_QUORUM_READY'
    : authorizedCount === 0
      ? 'NO_VERIFIED_ZERO_COST_PROVIDER'
      : 'ZERO_EURO_QUORUM_INSUFFICIENT';

  return {
    status,
    capability: targetCapability,
    minimum: required,
    provider_count: candidates.length,
    healthy_provider_count: healthy.length,
    authorized_zero_cost_count: authorizedCount,
    authorized_provider_ids: authorized.map(provider => String(provider.id || '')),
    blocked,
    reason,
  };
}
