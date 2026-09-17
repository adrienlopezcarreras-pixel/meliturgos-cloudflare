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

function providerSupportsCapability(provider, capability) {
  if (!provider || provider.enabled === false) return false;
  if (typeof provider.supports === 'function') return Boolean(provider.supports(capability));
  const wanted = String(capability || '').toUpperCase();
  return Array.isArray(provider.capabilities)
    && provider.capabilities.some(value => String(value || '').toUpperCase() === wanted);
}

/**
 * Distinguish a broken runtime from a healthy runtime deliberately protected by
 * the zero-euro policy. SAFE_IDLE is not an authorization to spend: it means
 * providers are reachable but none has the explicit zero-added-cost proof that
 * the governor requires. LIMITED means some providers are authorized, but not
 * enough for the requested quorum.
 */
export function classifyZeroCostReadiness({ minimum = 1, healthyCount = 0, authorizedCount = 0 } = {}) {
  const required = boundedMinimum(minimum);
  const healthy = Math.max(0, Math.floor(Number(healthyCount) || 0));
  const authorized = Math.max(0, Math.floor(Number(authorizedCount) || 0));
  if (healthy === 0) return { status: 'DEGRADED', reason: 'NO_HEALTHY_PROVIDER', minimum: required };
  if (authorized >= required) return { status: 'ONLINE', reason: 'ZERO_EURO_QUORUM_READY', minimum: required };
  if (authorized === 0) return { status: 'SAFE_IDLE', reason: 'ZERO_EURO_POLICY_PROTECTED', minimum: required };
  return { status: 'LIMITED', reason: 'ZERO_EURO_QUORUM_INSUFFICIENT', minimum: required };
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
    .filter(provider => providerSupportsCapability(provider, targetCapability));
  const healthy = candidates.filter(provider => provider.healthStatus === 'HEALTHY');
  const authorized = [];
  const blocked = [];

  for (const provider of healthy) {
    const evaluation = governor.evaluate(provider);
    if (evaluation.allowed) authorized.push(provider);
    else blocked.push(safeProvider(provider, evaluation));
  }

  const authorizedCount = authorized.length;
  const classified = classifyZeroCostReadiness({
    minimum: required,
    healthyCount: healthy.length,
    authorizedCount,
  });

  return {
    status: classified.status,
    capability: targetCapability,
    minimum: required,
    provider_count: candidates.length,
    healthy_provider_count: healthy.length,
    authorized_zero_cost_count: authorizedCount,
    authorized_provider_ids: authorized.map(provider => String(provider.id || '')),
    blocked,
    reason: classified.reason,
  };
}
