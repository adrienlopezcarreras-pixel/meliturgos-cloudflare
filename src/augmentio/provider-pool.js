export class ProviderPool {
  constructor(adapters = [], { healthCheckTimeoutMs = 1500 } = {}) {
    this.adapters = new Map();
    const ms = Number(healthCheckTimeoutMs);
    this.healthCheckTimeoutMs = Number.isFinite(ms)
      ? Math.max(10, Math.min(30000, Math.floor(ms)))
      : 1500;
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
      if (typeof item.health !== 'function') return;
      let timedOut = false;
      let timer;
      // A single broken health adapter must not starve all healthy models.
      // A timed-out provider is quarantined (not merely DEGRADED), because
      // DEGRADED providers remain eligible for invocation.
      const health = Promise.resolve().then(() => item.health()).then(
        (status) => {
          if (timedOut) {
            // Late health results must not undo a timeout quarantine.
            item.healthStatus = 'UNAVAILABLE';
            return;
          }
          item.healthStatus = typeof status === 'string' ? status : 'DEGRADED';
        },
        () => {
          item.healthStatus = timedOut ? 'UNAVAILABLE' : 'DEGRADED';
        },
      );
      const timeout = new Promise((resolve) => {
        timer = setTimeout(() => {
          timedOut = true;
          item.healthStatus = 'UNAVAILABLE';
          resolve();
        }, this.healthCheckTimeoutMs);
      });
      try {
        await Promise.race([health, timeout]);
      } finally {
        clearTimeout(timer);
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
