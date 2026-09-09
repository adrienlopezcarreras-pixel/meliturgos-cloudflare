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
      healthStatus: typeof adapter.health === 'string' ? adapter.health : (adapter.healthStatus || 'UNKNOWN'),
      priority: 0,
      concurrency: 1,
      estimatedCost: null,
      ...adapter,
    };
    if (typeof record.health === 'string') {
      record.healthStatus = record.health;
      delete record.health;
    }
    this.adapters.set(record.id, record);
    return record;
  }

  async refreshHealth() {
    await Promise.all([...this.adapters.values()].map(async (item) => {
      if (typeof item.health === 'function') {
        try {
          item.healthStatus = await item.health();
        } catch {
          item.healthStatus = 'DEGRADED';
        }
      }
    }));
    return this;
  }

  list({ capability } = {}) {
    return [...this.adapters.values()]
      .filter((item) => item.enabled !== false)
      .filter((item) => item.healthStatus !== 'UNAVAILABLE')
      .filter((item) => !capability || item.capabilities.includes(capability))
      .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
  }

  get(id) {
    return this.adapters.get(id) || null;
  }
}
