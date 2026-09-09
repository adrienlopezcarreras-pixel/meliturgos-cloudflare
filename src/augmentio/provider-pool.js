export class ProviderPool {
  constructor(adapters = []) {
    this.adapters = new Map();
    for (const adapter of adapters) this.register(adapter);
  }

  register(adapter) {
    if (!adapter?.id || typeof adapter.invoke !== 'function') {
      throw new TypeError('INVALID_PROVIDER_ADAPTER');
    }
    const record = {
      capabilities: [],
      enabled: true,
      health: 'UNKNOWN',
      priority: 0,
      concurrency: 1,
      // Unknown cost must remain unknown. ZeroEuroGovernor is fail-closed and
      // only permits providers whose zero cost is explicitly declared.
      estimatedCost: null,
      ...adapter,
    };
    this.adapters.set(record.id, record);
    return record;
  }

  list({ capability } = {}) {
    return [...this.adapters.values()]
      .filter((item) => item.enabled !== false)
      .filter((item) => item.health !== 'UNAVAILABLE')
      .filter((item) => !capability || item.capabilities.includes(capability))
      .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
  }

  get(id) {
    return this.adapters.get(id) || null;
  }
}
