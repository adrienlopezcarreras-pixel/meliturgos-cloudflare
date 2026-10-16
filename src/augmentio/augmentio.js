import { ZeroEuroGovernor } from './zero-euro-governor.js';
import { ParallelScheduler } from './parallel-scheduler.js';
import { ResultTournament } from './result-tournament.js';
import { ComputeCache } from './compute-cache.js';
import { QuotaArbitrator } from './quota-arbitrator.js';

// Bound untrusted model responses before ranking and caching them. Oversize
// replies must fail, not silently truncate into a misleading answer.
export const MAX_AUGMENTIO_RESPONSE_CHARS = 64 * 1024;
export const PARTIAL_FANOUT_CACHE_TTL_MS = 10_000;

// Match the capability contract: no direct caller can fan out to an
// unbounded number of models, including Infinity or large numeric strings.
export function boundedAugmentioCandidates(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 4;
  return Math.max(1, Math.min(12, Math.floor(n)));
}

function assertNotCancelled(signal) {
  if (signal?.aborted) {
    const error = new Error('SCHEDULER_ABORTED');
    error.code = 'SCHEDULER_ABORTED';
    throw error;
  }
}

async function refreshHealthWithinBudget(pool, signal, timeoutMs) {
  let timer;
  let onAbort;
  try {
    // Health checks can be external and can ignore AbortSignal. A hung health
    // probe must never hold the entire MEL fan-out indefinitely.
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => {
        const error = new Error('AUGMENTIO_HEALTH_REFRESH_TIMEOUT');
        error.code = 'AUGMENTIO_HEALTH_REFRESH_TIMEOUT';
        reject(error);
      }, timeoutMs);
    });
    const aborted = new Promise((_, reject) => {
      onAbort = () => {
        const error = new Error('SCHEDULER_ABORTED');
        error.code = 'SCHEDULER_ABORTED';
        reject(error);
      };
      signal?.addEventListener?.('abort', onAbort, { once: true });
      if (signal?.aborted) onAbort();
    });
    await Promise.race([
      Promise.resolve().then(() => {
        assertNotCancelled(signal);
        return pool?.refreshHealth?.();
      }),
      timeout,
      aborted,
    ]);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener?.('abort', onAbort);
  }
}

export class Augmentio {
  constructor({
    pool,
    governor = new ZeroEuroGovernor(),
    scheduler = new ParallelScheduler(),
    tournament = new ResultTournament(),
    cache = new ComputeCache(),
    quota = new QuotaArbitrator(),
    healthRefreshTimeoutMs = 5000,
  } = {}) {
    this.pool = pool;
    this.governor = governor;
    this.scheduler = scheduler;
    this.tournament = tournament;
    this.cache = cache;
    this.quota = quota;
    const requestedHealthBudget = Number(healthRefreshTimeoutMs);
    this.healthRefreshTimeoutMs = Number.isFinite(requestedHealthBudget)
      ? Math.max(10, Math.min(30_000, Math.floor(requestedHealthBudget)))
      : 5000;
  }

  async fanOut({ capability = 'GENERAL', input, context = {}, maxCandidates = 4, signal } = {}) {
    assertNotCancelled(signal);
    const limit = boundedAugmentioCandidates(maxCandidates);
    // A cached answer is not an authorization grant. Re-evaluate live model
    // availability and the zero-added-cost policy before considering cache.
    await refreshHealthWithinBudget(this.pool, signal, this.healthRefreshTimeoutMs);
    assertNotCancelled(signal);
    const providers = this.quota.filter(
      this.pool.list({ capability }).filter((provider) => this.governor.allows(provider)),
    ).slice(0, limit);

    if (!providers.length) {
      const error = new Error('NO_ZERO_COST_PROVIDER_AVAILABLE');
      error.code = 'NO_ZERO_COST_PROVIDER_AVAILABLE';
      throw error;
    }

    // Bind cached answers to the exact currently eligible provider/model
    // roster. Disabling, replacing or reconfiguring an adapter invalidates
    // the former roster's cached response.
    const roster = providers.map((provider) => ({
      id: provider.id,
      provider: provider.providerId ?? provider.provider_id ?? provider.id,
      model: provider.modelId ?? provider.model_id ?? provider.id,
    }));
    const cacheKey = { capability, input, context, maxCandidates: limit, roster };
    const cached = await this.cache.get(cacheKey);
    // Live authorization can change even between roster selection and lookup.
    assertNotCancelled(signal);
    if (cached && providers.every((provider) => this.governor.allows(provider))) {
      assertNotCancelled(signal);
      return { ...cached, cacheHit: true };
    }

    const settled = await this.scheduler.run(providers, async (provider, _index, meta = {}) => {
      const startedAt = Date.now();
      try {
        // Provider metadata is mutable. Selection-time authorization is not
        // enough: revalidate immediately before every external invocation so a
        // late cost/provenance change cannot race past the zero-euro gate.
        this.governor.assertAllowed(provider);
        const response = await provider.invoke({ input, context, capability, signal: meta.signal });
        // A late provider response must not be credited after its attempt was
        // cancelled or timed out by the scheduler.
        assertNotCancelled(meta.signal);
        assertNotCancelled(signal);
        const text = typeof response === 'string' ? response : response?.text ?? response?.response;
        // Empty/whitespace responses are failures, never successful Council
        // contributions or cached candidates. Do not stringify arbitrary
        // objects into apparently meaningful "[object Object]" answers.
        if (typeof text !== 'string' || !text.trim()) {
          const error = new Error('EMPTY_PROVIDER_RESPONSE');
          error.code = 'EMPTY_PROVIDER_RESPONSE';
          throw error;
        }
        if (text.length > MAX_AUGMENTIO_RESPONSE_CHARS) {
          const error = new Error('AI_PROVIDER_RESPONSE_TOO_LARGE');
          error.code = 'AI_PROVIDER_RESPONSE_TOO_LARGE';
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
        if (error?.code === 'SCHEDULER_ABORTED') throw error;
        this.quota.recordFailure(provider.id, error);
        throw error;
      }
    }, { signal });

    // A cancelled multi-AI run is never a partial success, even if one
    // provider completed before cancellation. Never cache a cancelled batch.
    assertNotCancelled(signal);
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
    assertNotCancelled(signal);
    // A partial fan-out must not hide a recovered model for five minutes.
    // Keep short-lived fallback caching, but retry failed peers much sooner.
    if (result.failures > 0) {
      await this.cache.set(cacheKey, result, PARTIAL_FANOUT_CACHE_TTL_MS);
    } else {
      await this.cache.set(cacheKey, result);
    }
    assertNotCancelled(signal);
    return result;
  }
}
