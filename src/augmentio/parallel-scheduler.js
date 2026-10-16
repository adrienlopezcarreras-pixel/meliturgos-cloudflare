function schedulerAborted() {
  return Object.assign(new Error('SCHEDULER_ABORTED'), { code: 'SCHEDULER_ABORTED' });
}

function sleep(ms, signal) {
  if (signal?.aborted) return Promise.reject(schedulerAborted());
  return new Promise((resolve, reject) => {
    let timer;
    const onAbort = () => {
      clearTimeout(timer);
      signal?.removeEventListener?.('abort', onAbort);
      reject(schedulerAborted());
    };
    timer = setTimeout(() => {
      signal?.removeEventListener?.('abort', onAbort);
      resolve();
    }, ms);
    signal?.addEventListener?.('abort', onAbort, { once: true });
    if (signal?.aborted) onAbort();
  });
}

function providerKey(task, fallback = 'default') {
  return String(task?.providerId ?? task?.provider?.id ?? task?.provider_id ?? task?.id ?? fallback);
}

function isNonRetryableProviderError(error) {
  const status = Number(error?.status ?? error?.statusCode);
  if (status === 401 || status === 403 || status === 429) return true;
  const code = String(error?.code || '');
  // Repeating an authorization or deterministic validation failure cannot
  // repair it; give other independent AI models their chance instead.
  return code.startsWith('ZERO_EURO_')
    || code === 'AUGMENTIO_PROVIDER_DISABLED'
    || code === 'AUGMENTIO_PROVIDER_IDENTITY_CHANGED'
    || code === 'COUNCIL_PROVIDER_IDENTITY_CHANGED'
    || code === 'AI_PROVIDER_RESPONSE_TOO_LARGE'
    || code === 'EMPTY_PROVIDER_RESPONSE';
}

function boundedInteger(value, fallback, min, max) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, Math.floor(n))) : fallback;
}

function providerConcurrency(task, fallback) {
  return boundedInteger(task?.concurrency ?? task?.provider?.concurrency ?? fallback,
    fallback, 1, 16);
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
    // Retry and concurrency options can be passed from plugins and model
    // metadata; nonfinite or huge values must never produce unbounded loops.
    this.globalConcurrency = boundedInteger(globalConcurrency, 8, 1, 32);
    this.perProviderConcurrency = boundedInteger(perProviderConcurrency, 2, 1, 16);
    this.timeoutMs = boundedInteger(timeoutMs, 30000, 1, 120000);
    this.retries = boundedInteger(retries, 1, 0, 5);
    this.backoffMs = boundedInteger(backoffMs, 100, 0, 30000);
    this.circuitBreakerFailures = boundedInteger(circuitBreakerFailures, 3, 1, 100);
    this.circuitBreakerCooldownMs = boundedInteger(circuitBreakerCooldownMs, 60000, 1, 3600000);
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
      let onAbort;
      // Worker adapters may ignore AbortSignal. Race parent cancellation
      // explicitly so a cancelled MEL task cannot be reported as successful.
      const aborted = new Promise((_, reject) => {
        onAbort = () => {
          controller.abort(signal?.reason);
          reject(Object.assign(new Error('SCHEDULER_ABORTED'), { code: 'SCHEDULER_ABORTED' }));
        };
        signal?.addEventListener?.('abort', onAbort, { once: true });
      });
      let timer;
      try {
        const timeout = new Promise((_, reject) => {
          timer = setTimeout(() => {
            // Reject the scheduler deadline first. Abort-aware adapters may
            // synchronously reject with SCHEDULER_ABORTED when signalled;
            // that must not mask a real timeout or skip timeout retries.
            reject(Object.assign(new Error('PROVIDER_TIMEOUT'), { code: 'PROVIDER_TIMEOUT', provider }));
            controller.abort('timeout');
          }, this.timeoutMs);
        });
        // Cover a signal aborted between the initial attempt check and
        // listener registration, including cancellation during scheduling.
        if (signal?.aborted) onAbort();
        const value = await Promise.race([
          Promise.resolve().then(() => {
            if (signal?.aborted) throw Object.assign(new Error('SCHEDULER_ABORTED'), { code: 'SCHEDULER_ABORTED' });
            return worker(task, index, { attempt, signal: controller.signal, provider });
          }),
          timeout,
          aborted,
        ]);
        clearTimeout(timer);
        this.markSuccess(provider);
        signal?.removeEventListener?.('abort', onAbort);
        return value;
      } catch (error) {
        clearTimeout(timer);
        signal?.removeEventListener?.('abort', onAbort);
        // Parent cancellation is not a provider fault, must not poison its
        // circuit breaker, and must never enter the retry loop.
        if (signal?.aborted) throw schedulerAborted();
        if (error?.code === 'SCHEDULER_ABORTED') throw error;
        lastError = error;
        this.markFailure(provider);
        // 401/403 need new credentials, 429 needs its quota cooldown, and
        // invalid zero-euro provenance needs explicit approval. Retrying
        // immediately only masks the original cause with a new error.
        if (isNonRetryableProviderError(error)
          || attempt >= this.retries || !this.canRun(provider)) break;
        // Owner cancellation must interrupt retry backoff, even if a provider
        // was about to retry after a transient failure.
        if (this.backoffMs) await sleep(this.backoffMs * (2 ** attempt), signal);
      }
    }
    throw lastError;
  }

  async run(tasks = [], worker, {
    getProviderId = providerKey,
    getProviderConcurrency = (task) => providerConcurrency(task, this.perProviderConcurrency),
    signal,
  } = {}) {
    const results = new Array(tasks.length);
    const pending = tasks.map((task, index) => ({
      task,
      index,
      provider: getProviderId(task, index),
      // Custom provider concurrency callbacks may come from model metadata.
      // NaN/zero would deadlock a pending task; Infinity or huge values
      // would bypass the per-provider safety bound. Normalize every result.
      providerConcurrency: boundedInteger(
        getProviderConcurrency(task, index), this.perProviderConcurrency, 1, 16,
      ),
    }));
    const activePerProvider = new Map();
    const active = new Set();

    const launchAvailable = () => {
      for (let i = 0; i < pending.length && active.size < this.globalConcurrency;) {
        const item = pending[i];
        const count = activePerProvider.get(item.provider) || 0;
        if (count >= item.providerConcurrency) { i += 1; continue; }
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
      }
    };

    while (pending.length || active.size) {
      if (signal?.aborted) {
        for (const item of pending.splice(0)) results[item.index] = { status: 'rejected', reason: Object.assign(new Error('SCHEDULER_ABORTED'), { code: 'SCHEDULER_ABORTED' }) };
      }
      launchAvailable();
      if (active.size) await Promise.race(active);
      else if (pending.length) {
        for (const item of pending.splice(0)) results[item.index] = { status: 'rejected', reason: Object.assign(new Error('SCHEDULER_DEADLOCK'), { code: 'SCHEDULER_DEADLOCK' }) };
      }
    }
    return results;
  }
}
