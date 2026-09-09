export class ProviderPool {
  constructor(adapters = []) {
    this.adapters = new Map();
    for (const adapter of adapters) this.register(adapter);
  }

  register(adapter) {
    if (!adapter?.id || typeof adapter.invoke !== 'function') {
      throw new TypeError('INVALID_PROVIDER_ADAPTER');
    }
    const record = adapter;
    if (!Array.isArray(record.capabilities)) record.capabilities = [];
    if (record.enabled === undefined) record.enabled = true;
    if (record.priority === undefined) record.priority = 0;
    if (record.concurrency === undefined) record.concurrency = 1;
    if (record.estimatedCost === undefined) record.estimatedCost = null;
    if (typeof record.health === 'string') {
      record.healthStatus = record.health;
      delete record.health;
    } else if (!record.healthStatus) {
      record.healthStatus = 'UNKNOWN';
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
