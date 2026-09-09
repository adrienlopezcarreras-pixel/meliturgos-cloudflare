function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function providerKey(task, fallback = 'default') {
  return String(task?.providerId ?? task?.provider?.id ?? task?.provider_id ?? task?.id ?? fallback);
}

export class ParallelScheduler {
  constructor({
    globalConcurrency = 8,
    perProviderConcurrency = 2,
    timeoutMs = 30000,
    retries = 1,
    backoffMs = 100,
    circuitBreakerFailures = 3,
    circuitBreakerCooldownMs = 60000,
    now = () => Date.now(),
  } = {}) {
    this.globalConcurrency = Math.max(1, globalConcurrency);
    this.perProviderConcurrency = Math.max(1, perProviderConcurrency);
    this.timeoutMs = Math.max(1, timeoutMs);
    this.retries = Math.max(0, retries);
    this.backoffMs = Math.max(0, backoffMs);
    this.circuitBreakerFailures = Math.max(1, circuitBreakerFailures);
    this.circuitBreakerCooldownMs = Math.max(1, circuitBreakerCooldownMs);
    this.now = now;
    this.breakers = new Map();
  }

  breaker(provider) {
    return this.breakers.get(provider) || { failures: 0, openUntil: 0 };
  }

  canRun(provider) {
    const state = this.breaker(provider);
    if (state.openUntil && state.openUntil <= this.now()) {
      this.breakers.set(provider, { failures: 0, openUntil: 0 });
      return true;
    }
    return !state.openUntil;
  }

  markSuccess(provider) {
    this.breakers.set(provider, { failures: 0, openUntil: 0 });
  }

  markFailure(provider) {
    const state = this.breaker(provider);
    const failures = state.failures + 1;
    this.breakers.set(provider, {
      failures,
      openUntil: failures >= this.circuitBreakerFailures ? this.now() + this.circuitBreakerCooldownMs : 0,
    });
  }

  async attempt(task, index, worker, { provider, signal } = {}) {
    let lastError;
    for (let attempt = 0; attempt <= this.retries; attempt += 1) {
      if (signal?.aborted) throw Object.assign(new Error('SCHEDULER_ABORTED'), { code: 'SCHEDULER_ABORTED' });
      if (!this.canRun(provider)) throw Object.assign(new Error('PROVIDER_CIRCUIT_OPEN'), { code: 'PROVIDER_CIRCUIT_OPEN', provider });

      const controller = new AbortController();
      const onAbort = () => controller.abort(signal?.reason);
      signal?.addEventListener?.('abort', onAbort, { once: true });
      let timer;
      try {
        const timeout = new Promise((_, reject) => {
          timer = setTimeout(() => {
            controller.abort('timeout');
            reject(Object.assign(new Error('PROVIDER_TIMEOUT'), { code: 'PROVIDER_TIMEOUT', provider }));
          }, this.timeoutMs);
        });
        const value = await Promise.race([
          Promise.resolve(worker(task, index, { attempt, signal: controller.signal, provider })),
          timeout,
        ]);
        clearTimeout(timer);
        this.markSuccess(provider);
        signal?.removeEventListener?.('abort', onAbort);
        return value;
      } catch (error) {
        clearTimeout(timer);
        signal?.removeEventListener?.('abort', onAbort);
        lastError = error;
        this.markFailure(provider);
        if (attempt >= this.retries || !this.canRun(provider)) break;
        if (this.backoffMs) await sleep(this.backoffMs * (2 ** attempt));
      }
    }
    throw lastError;
  }

  async run(tasks = [], worker, { getProviderId = providerKey, signal } = {}) {
    const results = new Array(tasks.length);
    const pending = tasks.map((task, index) => ({ task, index, provider: getProviderId(task, index) }));
    const activePerProvider = new Map();
    const active = new Set();

    const launchAvailable = () => {
      let launched = false;
      for (let i = 0; i < pending.length && active.size < this.globalConcurrency;) {
        const item = pending[i];
        const count = activePerProvider.get(item.provider) || 0;
        if (count >= this.perProviderConcurrency) { i += 1; continue; }
        pending.splice(i, 1);
        activePerProvider.set(item.provider, count + 1);
        const promise = this.attempt(item.task, item.index, worker, { provider: item.provider, signal })
          .then((value) => { results[item.index] = { status: 'fulfilled', value }; })
          .catch((reason) => { results[item.index] = { status: 'rejected', reason }; })
          .finally(() => {
            active.delete(promise);
            activePerProvider.set(item.provider, Math.max(0, (activePerProvider.get(item.provider) || 1) - 1));
          });
        active.add(promise);
        launched = true;
      }
      return launched;
    };

    while (pending.length || active.size) {
      if (signal?.aborted) {
        for (const item of pending.splice(0)) results[item.index] = { status: 'rejected', reason: Object.assign(new Error('SCHEDULER_ABORTED'), { code: 'SCHEDULER_ABORTED' }) };
      }
      launchAvailable();
      if (active.size) await Promise.race(active);
      else if (pending.length) {
        // No task can launch only if provider slots are inconsistent; fail closed instead of spinning.
        for (const item of pending.splice(0)) results[item.index] = { status: 'rejected', reason: Object.assign(new Error('SCHEDULER_DEADLOCK'), { code: 'SCHEDULER_DEADLOCK' }) };
      }
    }
    return results;
  }
}
