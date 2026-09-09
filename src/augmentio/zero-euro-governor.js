export class ZeroEuroGovernor {
  constructor({ maxCost = 0 } = {}) {
    this.maxCost = Number(maxCost) || 0;
  }

  allows(candidate = {}) {
    const estimatedCost = Number(candidate.estimatedCost ?? candidate.cost ?? 0);
    if (!Number.isFinite(estimatedCost)) return false;
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
