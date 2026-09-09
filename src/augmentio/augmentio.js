import { ZeroEuroGovernor } from './zero-euro-governor.js';
import { ParallelScheduler } from './parallel-scheduler.js';
import { ResultTournament } from './result-tournament.js';
import { ComputeCache } from './compute-cache.js';

export class Augmentio {
  constructor({ pool, governor = new ZeroEuroGovernor(), scheduler = new ParallelScheduler(), tournament = new ResultTournament(), cache = new ComputeCache() } = {}) {
    this.pool = pool;
    this.governor = governor;
    this.scheduler = scheduler;
    this.tournament = tournament;
    this.cache = cache;
  }

  async fanOut({ capability = 'GENERAL', input, context = {}, maxCandidates = 4 } = {}) {
    const cacheKey = { capability, input, context, maxCandidates };
    const cached = await this.cache.get(cacheKey);
    if (cached) return { ...cached, cacheHit: true };

    const providers = this.pool.list({ capability })
      .filter((provider) => this.governor.allows(provider))
      .slice(0, Math.max(1, maxCandidates));

    if (!providers.length) {
      const error = new Error('NO_ZERO_COST_PROVIDER_AVAILABLE');
      error.code = 'NO_ZERO_COST_PROVIDER_AVAILABLE';
      throw error;
    }

    const settled = await this.scheduler.run(providers, async (provider) => {
      const startedAt = Date.now();
      const response = await provider.invoke({ input, context, capability });
      const text = typeof response === 'string' ? response : response?.text ?? response?.response;
      if (!text) throw new Error('EMPTY_PROVIDER_RESPONSE');
      return {
        provider: provider.id,
        model: provider.modelId ?? provider.model_id ?? provider.id,
        text: String(text).trim(),
        latencyMs: Date.now() - startedAt,
        provenance: response?.provenance ?? { provider: provider.id },
        evidenceScore: response?.evidenceScore ?? 0,
        testsPassed: response?.testsPassed,
        confidence: response?.confidence ?? 0,
      };
    });

    const candidates = settled.filter((item) => item.status === 'fulfilled').map((item) => item.value);
    if (!candidates.length) {
      const error = new Error('ALL_PROVIDERS_FAILED');
      error.code = 'ALL_PROVIDERS_FAILED';
      error.failures = settled.filter((item) => item.status === 'rejected').map((item) => String(item.reason?.message ?? item.reason));
      throw error;
    }

    const ranked = this.tournament.rank(candidates);
    const result = { best: ranked[0], candidates: ranked, failures: settled.length - candidates.length, cacheHit: false };
    await this.cache.set(cacheKey, result);
    return result;
  }
}
