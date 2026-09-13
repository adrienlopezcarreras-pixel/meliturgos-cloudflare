export class ZeroEuroGovernor {
  constructor() {
    // This governor is intentionally zero-euro only. Its budget cannot be
    // widened through caller configuration.
    this.maxCost = 0;
  }

  allows(candidate = {}) {
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
