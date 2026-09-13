export const ZERO_EURO_POLICY = 'MEL_ZERO_EURO_V1';

function clean(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function finiteCost(value) {
  const type = typeof value;
  if (type !== 'number' && type !== 'string') return null;
  if (type === 'string' && value.trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

export class ZeroEuroGovernor {
  constructor() {
    // This governor is intentionally zero-euro only. Its budget cannot be
    // widened through caller configuration.
    this.maxCost = 0;
    this.policy = ZERO_EURO_POLICY;
  }

  hasVerifiedZeroCostProvenance(candidate = {}) {
    const provenance = candidate.costProvenance ?? candidate.cost_provenance;
    if (!provenance || typeof provenance !== 'object' || Array.isArray(provenance)) return false;
    if (provenance.verified !== true) return false;
    if (!clean(provenance.source)) return false;

    const rawAddedCost = provenance.addedCost ?? provenance.added_cost;
    const addedCost = finiteCost(rawAddedCost);
    if (addedCost !== 0) return false;

    // Verification is evidence; authorization is a separate local policy gate.
    // The approval must be explicit and bound to the exact adapter identity so
    // a zero-cost proof cannot be copied to another provider/model accidentally.
    const authorization = provenance.authorization;
    if (!authorization || typeof authorization !== 'object' || Array.isArray(authorization)) return false;
    if (authorization.approved !== true || clean(authorization.policy) !== this.policy) return false;
    if (!clean(authorization.authority)) return false;

    const adapterId = clean(candidate.id);
    if (!adapterId || clean(authorization.adapter_id) !== adapterId) return false;

    const providerId = clean(candidate.providerId ?? candidate.provider_id);
    if (providerId && clean(authorization.provider) !== providerId) return false;

    const modelId = clean(candidate.modelId ?? candidate.model_id);
    if (modelId && clean(authorization.model) !== modelId) return false;

    return true;
  }

  evaluate(candidate = {}) {
    const provenance = candidate.costProvenance ?? candidate.cost_provenance;
    if (!provenance || typeof provenance !== 'object' || Array.isArray(provenance) || provenance.verified !== true || !clean(provenance.source)) {
      return { allowed: false, code: 'ZERO_EURO_PROVENANCE_REQUIRED' };
    }

    const addedCost = finiteCost(provenance.addedCost ?? provenance.added_cost);
    if (addedCost === null) return { allowed: false, code: 'ZERO_EURO_ADDED_COST_UNKNOWN' };
    if (addedCost !== 0) return { allowed: false, code: 'ZERO_EURO_ADDED_COST_NOT_ZERO' };

    if (!this.hasVerifiedZeroCostProvenance(candidate)) {
      return { allowed: false, code: 'ZERO_EURO_AUTHORIZATION_REQUIRED' };
    }

    const estimatedCost = finiteCost(candidate.estimatedCost ?? candidate.cost);
    if (estimatedCost === null) return { allowed: false, code: 'ZERO_EURO_COST_UNKNOWN' };
    if (estimatedCost > this.maxCost) return { allowed: false, code: 'ZERO_EURO_BUDGET_EXCEEDED' };

    return { allowed: true, code: 'ZERO_EURO_ALLOWED', estimated_cost: estimatedCost };
  }

  allows(candidate = {}) {
    return this.evaluate(candidate).allowed === true;
  }

  assertAllowed(candidate = {}) {
    const evaluation = this.evaluate(candidate);
    if (!evaluation.allowed) {
      const error = new Error(evaluation.code);
      error.code = evaluation.code;
      throw error;
    }
    return true;
  }
}
