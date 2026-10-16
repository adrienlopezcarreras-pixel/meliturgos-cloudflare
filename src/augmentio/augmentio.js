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
    const eligibleProviders = () => this.quota.filter(
      this.pool.list({ capability }).filter((provider) => this.governor.allows(provider)),
    ).filter((provider) => this.scheduler?.canRun?.(provider.id) !== false);
    // An open circuit is not an available AI model. Fill every requested
    // slot from healthy, authorized alternatives instead of wasting it.
    const providers = eligibleProviders().slice(0, limit);

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
    // A health check or owner may revoke/replace an adapter during the async
    // cache lookup. Never use stale cache (or execute old selected adapters).
    assertNotCancelled(signal);
    const current = eligibleProviders().slice(0, limit);
    const stable = current.length === providers.length && current.every((provider, i) =>
      provider === providers[i]
      && provider.id === roster[i].id
      && (provider.providerId ?? provider.provider_id ?? provider.id) === roster[i].provider
      && (provider.modelId ?? provider.model_id ?? provider.id) === roster[i].model);
    if (!stable) {
      const error = new Error('AUGMENTIO_PROVIDER_ROSTER_CHANGED');
      error.code = 'AUGMENTIO_PROVIDER_ROSTER_CHANGED';
      throw error;
    }
    if (cached) {
      assertNotCancelled(signal);
      return { ...cached, cacheHit: true };
    }

    // Selection is not execution: a scheduler circuit breaker may reject a
    // provider before its adapter is invoked. Count only real calls as
    // attempted work in autonomy / multi-AI evidence.
    const invokedProviderIds = new Set();
    const settled = await this.scheduler.run(providers, async (provider, _index, meta = {}) => {
      const startedAt = Date.now();
      try {
        // Provider metadata is mutable. Selection-time authorization is not
        // enough: revalidate immediately before every external invocation so a
        // late cost/provenance change cannot race past the zero-euro gate.
        if (provider.enabled === false || provider.healthStatus === 'UNAVAILABLE'
          || this.quota?.isAvailable?.(provider.id) === false) {
          const error = new Error('AUGMENTIO_PROVIDER_DISABLED');
          error.code = 'AUGMENTIO_PROVIDER_DISABLED';
          throw error;
        }
        // The exact authorized model must not change between selection and
        // invocation; an adapter must never be attributed to another model.
        const identity = roster[_index];
        const sameIdentity = identity && provider.id === identity.id
          && (provider.providerId ?? provider.provider_id ?? provider.id) === identity.provider
          && (provider.modelId ?? provider.model_id ?? provider.id) === identity.model;
        if (!sameIdentity) {
          const error = new Error('AUGMENTIO_PROVIDER_IDENTITY_CHANGED');
          error.code = 'AUGMENTIO_PROVIDER_IDENTITY_CHANGED';
          throw error;
        }
        this.governor.assertAllowed(provider);
        invokedProviderIds.add(identity.id);
        const response = await provider.invoke({ input, context, capability, signal: meta.signal });
        if ((provider.providerId ?? provider.provider_id ?? provider.id) !== identity.provider
          || (provider.modelId ?? provider.model_id ?? provider.id) !== identity.model) {
          const error = new Error('AUGMENTIO_PROVIDER_IDENTITY_CHANGED');
          error.code = 'AUGMENTIO_PROVIDER_IDENTITY_CHANGED';
          throw error;
        }
        // A route can lose zero-added-cost authorization during the await
        // (provider configuration, quota or owner policy changes). Discard
        // that result rather than crediting/caching it as a compliant answer.
        this.governor.assertAllowed(provider);
        if (provider.enabled === false || provider.healthStatus === 'UNAVAILABLE'
          || this.quota?.isAvailable?.(provider.id) === false) {
          const error = new Error('AUGMENTIO_PROVIDER_DISABLED');
          error.code = 'AUGMENTIO_PROVIDER_DISABLED';
          throw error;
        }
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
        // Model-supplied provenance is supporting metadata, not authoritative
        // identity. Pin provider/model/adapter to the invoked authorized route.
        const source = response?.provenance;
        const metadata = source && typeof source === 'object' && !Array.isArray(source)
          ? source : {};
        this.quota.recordSuccess(provider.id);
        return {
          provider: identity.provider,
          adapterId: identity.id,
          model: identity.model,
          text: String(text).trim(),
          latencyMs: Date.now() - startedAt,
          provenance: {
            ...metadata,
            provider: identity.provider,
            model: identity.model,
            adapter_id: identity.id,
          },
          evidenceScore: response?.evidenceScore ?? 0,
          testsPassed: response?.testsPassed,
          confidence: response?.confidence ?? 0,
        };
      } catch (error) {
        // Aborts and timeouts are owned by the scheduler; a late aborted
        // adapter result must not inflate the provider quota failure count.
        if (meta.signal?.aborted || signal?.aborted || error?.code === 'SCHEDULER_ABORTED') throw error;
        this.quota.recordFailure(provider.id, error);
        throw error;
      }
    }, {
      signal,
      // Independent AI adapters must have independent circuit breakers.
      // Grouping by providerId ("workers-ai") would let a broken model
      // disable healthy sibling models sharing the same transport.
      getProviderId: (provider) => provider.id,
    });

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
      providersAttempted: roster.filter((row) => invokedProviderIds.has(row.id)).map((row) => row.id),
      // Stable identities come from the selected, authorized roster, not
      // mutable adapter objects observed after asynchronous execution.
      providerHealth: roster.map((row, i) => ({
        ...row,
        status: providers[i].healthStatus || 'UNKNOWN',
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
