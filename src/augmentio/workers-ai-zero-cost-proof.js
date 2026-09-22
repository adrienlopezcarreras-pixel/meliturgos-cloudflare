import { ZERO_EURO_POLICY } from './zero-euro-governor.js';

export const WORKERS_AI_ZERO_COST_PROOF_SCHEMA = 'mel.workers-ai.zero-cost-proof/v1';
export const WORKERS_AI_ZERO_COST_PRICING_POLICY = 'cloudflare-workers-ai-pricing-2026-08-28';
export const WORKERS_FREE_STATIC_ASSET_LIMIT_KEY = 'workers.static_assets.manifest_limit_file_count';
export const WORKERS_FREE_STATIC_ASSET_LIMIT = 20000;
export const WORKERS_FREE_AI_ALLOCATION_NEURONS = 10000;
export const WORKERS_AI_ZERO_COST_PROOF_MAX_AGE_MS = 60 * 60 * 1000;

function clean(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function parseObject(raw) {
  if (!raw) return null;
  if (typeof raw === 'object' && !Array.isArray(raw)) return raw;
  if (typeof raw !== 'string' || !raw.trim()) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function exactNumber(value, expected) {
  return Number.isFinite(Number(value)) && Number(value) === expected;
}

function validTimestamp(value) {
  const timestamp = Date.parse(String(value || ''));
  return Number.isFinite(timestamp) ? timestamp : null;
}

/**
 * Converts a short-lived, deployment-controlled Workers Free plan proof into
 * the canonical Zero-Euro Governor provenance object.
 *
 * The proof is intentionally NOT inferred from registry cost=0. It must come
 * from a trusted deployment/runtime environment after an authoritative
 * Cloudflare account-plan check. Missing, stale, malformed or mismatched proof
 * returns null and therefore keeps the existing governor fail-closed.
 */
export function workersAiRuntimeZeroCostProvenance(env = {}, {
  adapterId,
  modelId,
  now = Date.now(),
} = {}) {
  const adapter = clean(adapterId);
  const model = clean(modelId);
  if (!adapter || !model) return null;

  const proof = parseObject(env?.MEL_WORKERS_AI_ZERO_COST_PROOF_JSON);
  if (!proof) return null;

  if (clean(proof.schema) !== WORKERS_AI_ZERO_COST_PROOF_SCHEMA) return null;
  if (clean(proof.provider) !== 'workers-ai') return null;
  if (clean(proof.account_plan) !== 'WORKERS_FREE') return null;
  if (clean(proof.billing_path) !== 'direct-workers-ai-binding') return null;
  if (clean(proof.pricing_policy) !== WORKERS_AI_ZERO_COST_PRICING_POLICY) return null;
  if (!exactNumber(proof.free_allocation_neurons_per_day, WORKERS_FREE_AI_ALLOCATION_NEURONS)) return null;
  if (clean(proof.free_overage_behavior) !== 'FAIL_NOT_BILL') return null;

  const evidence = proof.plan_evidence;
  if (!evidence || typeof evidence !== 'object' || Array.isArray(evidence)) return null;
  if (clean(evidence.source) !== 'cloudflare-account-entitlements-api') return null;
  if (clean(evidence.account_type).toLowerCase() !== 'standard') return null;
  if (clean(evidence.entitlement_key) !== WORKERS_FREE_STATIC_ASSET_LIMIT_KEY) return null;
  if (!exactNumber(evidence.entitlement_value, WORKERS_FREE_STATIC_ASSET_LIMIT)) return null;
  if (!exactNumber(evidence.workers_free_reference_value, WORKERS_FREE_STATIC_ASSET_LIMIT)) return null;

  const models = Array.isArray(proof.models) ? proof.models.map(clean).filter(Boolean) : [];
  if (!models.includes(model)) return null;

  const verifiedAt = validTimestamp(proof.verified_at);
  const expiresAt = validTimestamp(proof.expires_at);
  const current = Number(now);
  if (verifiedAt === null || expiresAt === null || !Number.isFinite(current)) return null;
  if (verifiedAt > current + 60_000) return null;
  if (expiresAt <= current || expiresAt <= verifiedAt) return null;
  if (expiresAt - verifiedAt > WORKERS_AI_ZERO_COST_PROOF_MAX_AGE_MS) return null;

  return {
    verified: true,
    addedCost: 0,
    source: 'cloudflare-workers-free-plan-short-lived-proof',
    evidence: {
      schema: WORKERS_AI_ZERO_COST_PROOF_SCHEMA,
      authority: 'cloudflare-account-entitlements-api',
      account_plan: 'WORKERS_FREE',
      billing_path: 'direct-workers-ai-binding',
      pricing_policy: WORKERS_AI_ZERO_COST_PRICING_POLICY,
      verified_at: new Date(verifiedAt).toISOString(),
      expires_at: new Date(expiresAt).toISOString(),
      plan_signal: {
        account_type: 'standard',
        entitlement_key: WORKERS_FREE_STATIC_ASSET_LIMIT_KEY,
        entitlement_value: WORKERS_FREE_STATIC_ASSET_LIMIT,
      },
    },
    authorization: {
      approved: true,
      policy: ZERO_EURO_POLICY,
      authority: 'cloudflare-workers-free-plan-proof',
      adapter_id: adapter,
      provider: 'workers-ai',
      model,
    },
  };
}
