export class ProviderAdapter {
  constructor({
    id,
    providerId,
    modelId,
    capabilities = ['GENERAL'],
    invoke,
    healthCheck,
    quotaSnapshot,
    priority = 0,
    estimatedCost = null,
    concurrency = 1,
    authRequired = false,
    terms = null,
    enabled = true,
  } = {}) {
    if (!id || typeof invoke !== 'function') throw new TypeError('INVALID_PROVIDER_ADAPTER');
    this.id = String(id);
    this.providerId = String(providerId || id);
    this.modelId = String(modelId || id);
    this.capabilities = [...capabilities];
    this.priority = Number(priority) || 0;
    this.estimatedCost = estimatedCost;
    this.concurrency = Math.max(1, Number(concurrency) || 1);
    this.authRequired = Boolean(authRequired);
    this.terms = terms;
    this.enabled = enabled !== false;
    this.healthStatus = 'UNKNOWN';
    this._invoke = invoke;
    this._healthCheck = healthCheck;
    this._quotaSnapshot = quotaSnapshot;
    this.stats = { calls: 0, successes: 0, failures: 0, latencyMsTotal: 0, lastLatencyMs: null };
  }

  async invoke(args = {}) {
    const started = Date.now();
    this.stats.calls += 1;
    try {
      const result = await this._invoke(args);
      this.stats.successes += 1;
      this.healthStatus = 'HEALTHY';
      return result;
    } catch (error) {
      this.stats.failures += 1;
      this.healthStatus = error?.status === 401 || error?.status === 403 ? 'UNAVAILABLE' : 'DEGRADED';
      throw error;
    } finally {
      const latency = Date.now() - started;
      this.stats.lastLatencyMs = latency;
      this.stats.latencyMsTotal += latency;
    }
  }

  async health() {
    if (!this.enabled) return 'UNAVAILABLE';
    if (typeof this._healthCheck !== 'function') return this.healthStatus;
    try {
      const value = await this._healthCheck();
      this.healthStatus = typeof value === 'string' ? value : value?.status || 'HEALTHY';
    } catch (error) {
      this.healthStatus = error?.status === 401 || error?.status === 403 ? 'UNAVAILABLE' : 'DEGRADED';
    }
    return this.healthStatus;
  }

  async quota() {
    if (typeof this._quotaSnapshot !== 'function') return null;
    return this._quotaSnapshot();
  }

  latencyStats() {
    return {
      calls: this.stats.calls,
      successes: this.stats.successes,
      failures: this.stats.failures,
      lastLatencyMs: this.stats.lastLatencyMs,
      averageLatencyMs: this.stats.calls ? this.stats.latencyMsTotal / this.stats.calls : null,
    };
  }
}
