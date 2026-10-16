export class QuotaArbitrator {
  constructor({ cooldownMs = 60_000 } = {}) {
    const parsed = Number(cooldownMs);
    // Malformed configuration must not disable rate-limit protection or
    // indefinitely quarantine every provider.
    this.cooldownMs = Number.isFinite(parsed)
      ? Math.max(1000, Math.min(3_600_000, Math.floor(parsed)))
      : 60_000;
    this.state = new Map();
  }

  get(id) {
    return this.state.get(id) || { calls: 0, failures: 0, cooldownUntil: 0, lastStatus: null };
  }

  isAvailable(id, now = Date.now()) {
    return this.get(id).cooldownUntil <= now;
  }

  recordSuccess(id) {
    const current = this.get(id);
    // Several calls to one model may finish out of order. A late 200 result
    // must never revoke a still-active 429 cooldown established by a peer.
    const cooling = current.cooldownUntil > Date.now();
    this.state.set(id, {
      ...current,
      calls: current.calls + 1,
      lastStatus: cooling ? current.lastStatus : 200,
      cooldownUntil: cooling ? current.cooldownUntil : 0,
    });
  }

  recordFailure(id, error) {
    const current = this.get(id);
    const status = Number(error?.status ?? error?.statusCode ?? error?.code);
    const rateLimited = status === 429 || /rate.?limit|quota|too many/i.test(String(error?.message ?? ''));
    this.state.set(id, {
      ...current,
      calls: current.calls + 1,
      failures: current.failures + 1,
      lastStatus: Number.isFinite(status) ? status : null,
      // Repeated 429 responses cannot shorten an existing cooldown.
      cooldownUntil: rateLimited ? Math.max(current.cooldownUntil, Date.now() + this.cooldownMs)
        : current.cooldownUntil,
    });
  }

  filter(providers = []) {
    return providers.filter((provider) => this.isAvailable(provider.id));
  }
}
