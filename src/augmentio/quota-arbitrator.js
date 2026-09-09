export class QuotaArbitrator {
  constructor({ cooldownMs = 60_000 } = {}) {
    this.cooldownMs = cooldownMs;
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
    this.state.set(id, { ...current, calls: current.calls + 1, lastStatus: 200, cooldownUntil: 0 });
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
      cooldownUntil: rateLimited ? Date.now() + this.cooldownMs : current.cooldownUntil,
    });
  }

  filter(providers = []) {
    return providers.filter((provider) => this.isAvailable(provider.id));
  }
}
