import { scoreAiCandidate } from '../learning/source-intelligence.js';
const DEFAULT_THRESHOLDS = Object.freeze({
  minScore: Number.NEGATIVE_INFINITY,
  maxLatencyMs: Number.POSITIVE_INFINITY,
  maxCostUsd: Number.POSITIVE_INFINITY
});

const asText = (value) => typeof value === 'string' ? value.trim() : '';
const asFinite = (value) => Number.isFinite(Number(value)) ? Number(value) : null;

function modelKey(model) {
  return `${model.provider}:${model.id}`;
}

function normalizeModel(value) {
  if (!value || typeof value !== 'object') return null;
  const id = asText(value.id);
  const provider = asText(value.provider);
  if (!id || !provider) return null;
  return Object.freeze({ ...value, id, provider });
}

function normalizeKnownModels(knownModelIds = []) {
  return new Set(
    Array.isArray(knownModelIds)
      ? knownModelIds.map(asText).filter(Boolean)
      : []
  );
}

function normalizeAuthorization(result) {
  if (result === true) return { allowed: true, reason: 'authorized' };
  if (result && typeof result === 'object' && result.allowed === true) {
    return { allowed: true, reason: asText(result.reason) || 'authorized' };
  }
  if (result && typeof result === 'object') {
    return { allowed: false, reason: asText(result.reason) || 'not_authorized' };
  }
  return { allowed: false, reason: 'not_authorized' };
}

function normalizeThresholds(thresholds = {}) {
  const minScore = asFinite(thresholds.minScore);
  const maxLatencyMs = asFinite(thresholds.maxLatencyMs);
  const maxCostUsd = asFinite(thresholds.maxCostUsd);
  return {
    minScore: minScore ?? DEFAULT_THRESHOLDS.minScore,
    maxLatencyMs: maxLatencyMs ?? DEFAULT_THRESHOLDS.maxLatencyMs,
    maxCostUsd: maxCostUsd ?? DEFAULT_THRESHOLDS.maxCostUsd
  };
}

function classifyBenchmark(raw, thresholds) {
  const score = asFinite(raw?.score);
  const latencyMs = asFinite(raw?.latencyMs);
  const costUsd = asFinite(raw?.costUsd);
  const reasons = [];

  if (raw?.passed === false) reasons.push('benchmark_failed');
  if (score !== null && score < thresholds.minScore) reasons.push('score_below_threshold');
  if (latencyMs !== null && latencyMs > thresholds.maxLatencyMs) reasons.push('latency_above_threshold');
  if (costUsd !== null && costUsd > thresholds.maxCostUsd) reasons.push('cost_above_threshold');

  return {
    status: reasons.length ? 'degraded' : 'passed',
    reasons,
    metrics: { score, latencyMs, costUsd }
  };
}

function errorMessage(error) {
  if (error instanceof Error) return error.message;
  return String(error ?? 'unknown_error');
}

/**
 * GEN2-43 Model Watch.
 *
 * This service deliberately owns no network, storage, registry or deployment side effect.
 * Discovery, authorization and benchmarking are injected so callers can enforce provider,
 * owner and zero-cost policies before a model can even become a benchmark candidate.
 */
export function createModelWatch({ catalog, authorization, benchmark, now = () => new Date().toISOString() } = {}) {
  if (!catalog || typeof catalog.discover !== 'function') {
    throw new TypeError('catalog.discover adapter is required');
  }
  if (!authorization || typeof authorization.isAllowed !== 'function') {
    throw new TypeError('authorization.isAllowed adapter is required');
  }
  if (!benchmark || typeof benchmark.run !== 'function') {
    throw new TypeError('benchmark.run adapter is required');
  }
  if (typeof now !== 'function') throw new TypeError('now must be a function');

  async function discover({ knownModelIds = [], context = {} } = {}) {
    const known = normalizeKnownModels(knownModelIds);
    const discoveredAt = now();
    const rawCatalog = await catalog.discover(context);
    const rawModels = Array.isArray(rawCatalog) ? rawCatalog : rawCatalog?.models;
    if (!Array.isArray(rawModels)) {
      throw new TypeError('catalog.discover must return an array or { models: [] }');
    }

    const candidates = [];
    const rejected = [];
    const seen = new Set();

    for (const rawModel of rawModels) {
      const model = normalizeModel(rawModel);
      if (!model) {
        rejected.push({ model: rawModel, reason: 'invalid_model_descriptor' });
        continue;
      }

      const key = modelKey(model);
      if (seen.has(key)) continue;
      seen.add(key);

      if (known.has(key) || known.has(model.id)) continue;

      try {
        const decision = normalizeAuthorization(await authorization.isAllowed(model, context));
        if (decision.allowed) {
          candidates.push(model);
        } else {
          rejected.push({ model, reason: decision.reason });
        }
      } catch (error) {
        // Authorization fails closed: a policy failure must never authorize a model.
        rejected.push({ model, reason: 'authorization_error', error: errorMessage(error) });
      }
    }

    return Object.freeze({
      discoveredAt,
      candidates: Object.freeze(candidates),
      rejected: Object.freeze(rejected),
      counts: Object.freeze({
        discovered: rawModels.length,
        newAuthorized: candidates.length,
        rejected: rejected.length
      })
    });
  }

  async function run({ knownModelIds = [], suite = 'default', thresholds = {}, context = {} } = {}) {
    const normalizedThresholds = normalizeThresholds(thresholds);
    const discovery = await discover({ knownModelIds, context });
    const results = [];

    for (const model of discovery.candidates) {
      try {
        const raw = await benchmark.run(model, { suite, context });
        const classification = classifyBenchmark(raw, normalizedThresholds);
        const externalMetrics = raw?.externalMetrics || raw?.details?.source_intelligence_metrics || {};
        const sourceIntelligence = scoreAiCandidate({
          provider: model.provider,
          id: model.id,
          task: suite,
          metrics: {
            ...externalMetrics,
            mel_benchmark_score: classification.metrics.score,
            latency_score: externalMetrics.latency_score,
            cost_efficiency: externalMetrics.cost_efficiency,
          },
        }).model_quality;
        const localScore = classification.metrics.score ?? 0;
        const rankingScore = Number((0.7 * localScore + 0.3 * Number(sourceIntelligence?.score || 0)).toFixed(6));
        results.push(Object.freeze({
          model,
          status: classification.status,
          reasons: Object.freeze(classification.reasons),
          metrics: Object.freeze({ ...classification.metrics, rankingScore }),
          source_intelligence: Object.freeze(sourceIntelligence),
          details: raw?.details ?? null
        }));
      } catch (error) {
        // One provider/model failure must not prevent the remaining candidates from being measured.
        results.push(Object.freeze({
          model,
          status: 'error',
          reasons: Object.freeze(['benchmark_error']),
          metrics: Object.freeze({ score: null, latencyMs: null, costUsd: null }),
          error: errorMessage(error),
          details: null
        }));
      }
    }

    const ranked = results
      .filter((result) => result.status === 'passed')
      .slice()
      .sort((a, b) => {
        const rankA = a.metrics.rankingScore ?? a.metrics.score ?? Number.NEGATIVE_INFINITY;
        const rankB = b.metrics.rankingScore ?? b.metrics.score ?? Number.NEGATIVE_INFINITY;
        if (rankA !== rankB) return rankB - rankA;
        const scoreA = a.metrics.score ?? Number.NEGATIVE_INFINITY;
        const scoreB = b.metrics.score ?? Number.NEGATIVE_INFINITY;
        if (scoreA !== scoreB) return scoreB - scoreA;
        const latencyA = a.metrics.latencyMs ?? Number.POSITIVE_INFINITY;
        const latencyB = b.metrics.latencyMs ?? Number.POSITIVE_INFINITY;
        if (latencyA !== latencyB) return latencyA - latencyB;
        return modelKey(a.model).localeCompare(modelKey(b.model));
      });

    return Object.freeze({
      watchedAt: now(),
      suite,
      thresholds: Object.freeze(normalizedThresholds),
      discovery,
      results: Object.freeze(results),
      ranked: Object.freeze(ranked),
      recommendation: ranked[0] ?? null
    });
  }

  return Object.freeze({ discover, run });
}

export const MODEL_WATCH_STATUSES = Object.freeze(['passed', 'degraded', 'error']);
