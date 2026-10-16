const KNOWN_HEALTH = new Set(['HEALTHY', 'PROTECTED', 'DEGRADED', 'UNKNOWN']);
const UNAVAILABLE_HEALTH = new Set([
  'UNAVAILABLE', 'OFFLINE', 'DISABLED', 'AUTH_FAILED', 'UNAUTHORIZED',
  'FORBIDDEN', 'FAILED', 'ERROR', 'UNHEALTHY',
]);

function normalizedHealthStatus(value) {
  const status = typeof value === 'string' ? value.trim().toUpperCase() : '';
  // A probe returning an unfamiliar state must not certify that its model
  // can be called. UNKNOWN is retained only as the explicit supported state
  // for providers whose quota/transport cannot be probed authoritatively.
  return KNOWN_HEALTH.has(status) ? status
    : UNAVAILABLE_HEALTH.has(status) ? 'UNAVAILABLE' : 'UNAVAILABLE';
}

export class ProviderPool {
  constructor(adapters = [], { healthCheckTimeoutMs = 1500 } = {}) {
    this.adapters = new Map();
    // Track the newest probe per adapter: overlapping refreshes must never
    // let an old timeout or late reply overwrite a newer health result.
    this.healthProbeGeneration = new WeakMap();
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
      record.healthStatus = normalizedHealthStatus(record.health);
      delete record.health;
    } else if (!record.healthStatus) {
      record.healthStatus = 'UNKNOWN';
    } else {
      record.healthStatus = normalizedHealthStatus(record.healthStatus);
    }
    this.adapters.set(record.id, record);
    return record;
  }

  async refreshHealth() {
    await Promise.all([...this.adapters.values()].map(async (item) => {
      if (typeof item.health !== 'function') return;
      const generation = (this.healthProbeGeneration.get(item) || 0) + 1;
      this.healthProbeGeneration.set(item, generation);
      const isCurrent = () => this.healthProbeGeneration.get(item) === generation;
      let timedOut = false;
      let timer;
      // A single broken health adapter must not starve all healthy models.
      // A timed-out provider is quarantined (not merely DEGRADED), because
      // DEGRADED providers remain eligible for invocation.
      const health = Promise.resolve().then(() => item.health()).then(
        (status) => {
          // Ignore both late completions after timeout and stale completions
          // from an older overlapping refresh.
          if (!timedOut && isCurrent()) {
            // Some adapters report {status:'UNAVAILABLE'} or {ok:false}
            // rather than a bare string. Never turn their explicit failure
            // into a callable DEGRADED model.
            const reported = typeof status === 'string' ? status : status?.status;
            item.healthStatus = status?.ok === false ? 'UNAVAILABLE'
              : typeof reported === 'string' && reported.trim()
                ? normalizedHealthStatus(reported) : 'DEGRADED';
          }
        },
        (error) => {
          if (!timedOut && isCurrent()) {
            const status = Number(error?.status ?? error?.statusCode);
            // Authorization failures need new credentials, not another
            // inference attempt: quarantine rather than using DEGRADED.
            item.healthStatus = status === 401 || status === 403
              ? 'UNAVAILABLE' : 'DEGRADED';
          }
        },
      );
      const timeout = new Promise((resolve) => {
        timer = setTimeout(() => {
          timedOut = true;
          if (isCurrent()) {
            // ProviderAdapter.health() itself mutates healthStatus. Invalidate
            // that internal callback, not merely the pool's outer .then().
            try { item.invalidateHealthProbe?.(); } catch { /* preserve quarantine */ }
            item.healthStatus = 'UNAVAILABLE';
          }
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
      .filter((item) => normalizedHealthStatus(item.healthStatus) !== 'UNAVAILABLE')
      .filter((item) => !capability || item.capabilities.includes(capability))
      .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
  }

  get(id) {
    return this.adapters.get(id) || null;
  }
}
