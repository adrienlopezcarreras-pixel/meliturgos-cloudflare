export class ZeroEuroGovernor {
  constructor() {
    // This governor is intentionally zero-euro only. Its budget cannot be
    // widened through caller configuration.
    this.maxCost = 0;
  }

  hasVerifiedZeroCostProvenance(candidate = {}) {
    const provenance = candidate.costProvenance ?? candidate.cost_provenance;
    if (!provenance || typeof provenance !== 'object' || Array.isArray(provenance)) return false;
    if (provenance.verified !== true) return false;
    if (typeof provenance.source !== 'string' || !provenance.source.trim()) return false;
    const rawAddedCost = provenance.addedCost ?? provenance.added_cost;
    if (typeof rawAddedCost !== 'number' && typeof rawAddedCost !== 'string') return false;
    if (typeof rawAddedCost === 'string' && rawAddedCost.trim() === '') return false;
    const addedCost = Number(rawAddedCost);
    return Number.isFinite(addedCost) && addedCost === 0;
  }

  allows(candidate = {}) {
    // A numeric zero declaration alone is not evidence that a provider is
    // actually zero-added-cost. Require explicit verified provenance too.
    if (!this.hasVerifiedZeroCostProvenance(candidate)) return false;

    // Cost must be explicitly known. Only finite non-negative numbers or
    // non-blank numeric strings are accepted; booleans, objects and blank
    // strings must never be coerced to zero by Number(...).
    const rawCost = candidate.estimatedCost ?? candidate.cost;
    const type = typeof rawCost;
    if (type !== 'number' && type !== 'string') return false;
    if (type === 'string' && rawCost.trim() === '') return false;
    const estimatedCost = Number(rawCost);
    if (!Number.isFinite(estimatedCost) || estimatedCost < 0) return false;
    return estimatedCost <= this.maxCost;
  }

  assertAllowed(candidate = {}) {
    if (!this.allows(candidate)) {
      const error = new Error('ZERO_EURO_BUDGET_EXCEEDED');
      error.code = 'ZERO_EURO_BUDGET_EXCEEDED';
      throw error;
    }
    return true;
  }
}
