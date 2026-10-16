import { ZeroEuroGovernor } from './zero-euro-governor.js';
import { ParallelScheduler } from './parallel-scheduler.js';
import { ResultTournament } from './result-tournament.js';
import { ComputeCache } from './compute-cache.js';
import { QuotaArbitrator } from './quota-arbitrator.js';

// Match the capability contract: no direct caller can fan out to an
// unbounded number of models, including Infinity or large numeric strings.
export function boundedAugmentioCandidates(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 4;
  return Math.max(1, Math.min(12, Math.floor(n)));
}

export class Augmentio {
  constructor({
    pool,
    governor = new ZeroEuroGovernor(),
    scheduler = new ParallelScheduler(),
    tournament = new ResultTournament(),
    cache = new ComputeCache(),
    quota = new QuotaArbitrator(),
  } = {}) {
    this.pool = pool;
    this.governor = governor;
    this.scheduler = scheduler;
    this.tournament = tournament;
    this.cache = cache;
    this.quota = quota;
  }

  async fanOut({ capability = 'GENERAL', input, context = {}, maxCandidates = 4, signal } = {}) {
    const limit = boundedAugmentioCandidates(maxCandidates);
    const cacheKey = { capability, input, context, maxCandidates: limit };
    const cached = await this.cache.get(cacheKey);
    if (cached) return { ...cached, cacheHit: true };

    await this.pool?.refreshHealth?.();
    const providers = this.quota.filter(
      this.pool.list({ capability }).filter((provider) => this.governor.allows(provider)),
    ).slice(0, limit);

    if (!providers.length) {
      const error = new Error('NO_ZERO_COST_PROVIDER_AVAILABLE');
      error.code = 'NO_ZERO_COST_PROVIDER_AVAILABLE';
      throw error;
    }

    const settled = await this.scheduler.run(providers, async (provider, _index, meta = {}) => {
      const startedAt = Date.now();
      try {
        // Provider metadata is mutable. Selection-time authorization is not
        // enough: revalidate immediately before every external invocation so a
        // late cost/provenance change cannot race past the zero-euro gate.
        this.governor.assertAllowed(provider);
        const response = await provider.invoke({ input, context, capability, signal: meta.signal });
        const text = typeof response === 'string' ? response : response?.text ?? response?.response;
        // Empty/whitespace responses are failures, never successful Council
        // contributions or cached candidates. Do not stringify arbitrary
        // objects into apparently meaningful "[object Object]" answers.
        if (typeof text !== 'string' || !text.trim()) {
          const error = new Error('EMPTY_PROVIDER_RESPONSE');
          error.code = 'EMPTY_PROVIDER_RESPONSE';
          throw error;
        }
        this.quota.recordSuccess(provider.id);
        return {
          provider: provider.providerId ?? provider.provider_id ?? provider.id,
          adapterId: provider.id,
          model: provider.modelId ?? provider.model_id ?? provider.id,
          text: String(text).trim(),
          latencyMs: Date.now() - startedAt,
          provenance: response?.provenance ?? {
            provider: provider.providerId ?? provider.provider_id ?? provider.id,
            model: provider.modelId ?? provider.model_id ?? provider.id,
            adapter_id: provider.id,
          },
          evidenceScore: response?.evidenceScore ?? 0,
          testsPassed: response?.testsPassed,
          confidence: response?.confidence ?? 0,
        };
      } catch (error) {
        this.quota.recordFailure(provider.id, error);
        throw error;
      }
    }, { signal });

    const candidates = settled.filter((item) => item.status === 'fulfilled').map((item) => item.value);
    if (!candidates.length) {
      const error = new Error('ALL_PROVIDERS_FAILED');
      error.code = 'ALL_PROVIDERS_FAILED';
      error.failures = settled.filter((item) => item.status === 'rejected').map((item) => String(item.reason?.message ?? item.reason));
      throw error;
    }

    const ranked = this.tournament.rank(candidates);
    const result = {
      best: ranked[0],
      candidates: ranked,
      failures: settled.length - candidates.length,
      providersAttempted: providers.map((provider) => provider.id),
      providerHealth: providers.map((provider) => ({
        id: provider.id,
        provider: provider.providerId ?? provider.provider_id ?? provider.id,
        model: provider.modelId ?? provider.model_id ?? provider.id,
        status: provider.healthStatus || 'UNKNOWN',
      })),
      cacheHit: false,
    };
    await this.cache.set(cacheKey, result);
    return result;
  }
}
