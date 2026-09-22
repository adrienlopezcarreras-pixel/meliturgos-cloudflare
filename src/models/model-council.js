import { port } from '../core/contracts.js';
import { createDefaultAugmentioPool } from '../augmentio/default-pool.js';
import { ParallelScheduler } from '../augmentio/parallel-scheduler.js';
import { ZeroEuroGovernor, ZERO_EURO_POLICY } from '../augmentio/zero-euro-governor.js';

export const methods = ['queryMultiple', 'compare', 'score', 'synthesize'];

const DEFAULT_TIMEOUT_MS = 30000;
const DEFAULT_MAX_CANDIDATES = 4;

function clean(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function finiteOrNull(value) {
  if (value == null) return null;
  if (typeof value === 'string' && value.trim() === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function errorCode(error, fallback = 'PROVIDER_FAILED') {
  return clean(error?.code) || clean(error?.message) || fallback;
}

function providerIdentity(provider = {}) {
  const providerId = clean(provider.providerId ?? provider.provider_id ?? provider.id) || 'unknown-provider';
  const modelId = clean(provider.modelId ?? provider.model_id ?? provider.id) || 'unknown-model';
  return `${providerId}::${modelId}`;
}

function safeReportedProvenance(response = {}) {
  const source = response?.provenance;
  if (!source || typeof source !== 'object' || Array.isArray(source)) return null;
  const out = {};
  for (const key of ['provider', 'model', 'adapter_id', 'request_id', 'trace_id', 'region']) {
    const value = clean(source[key]);
    if (value) out[key] = value.slice(0, 240);
  }
  if (Array.isArray(source.inference_settings_applied)) {
    out.inference_settings_applied = source.inference_settings_applied
      .map(clean)
      .filter(Boolean)
      .slice(0, 20);
  }
  if (typeof source.lora_applied === 'boolean') out.lora_applied = source.lora_applied;
  return Object.keys(out).length ? out : null;
}

function canonicalProvenance(provider = {}, response = {}) {
  const reported = safeReportedProvenance(response);
  return {
    adapter_id: clean(provider.id) || null,
    provider: clean(provider.providerId ?? provider.provider_id ?? provider.id) || null,
    model: clean(provider.modelId ?? provider.model_id ?? provider.id) || null,
    reported,
  };
}

function normalizedInput(request) {
  if (typeof request === 'string' && request.trim()) return request.trim();
  if (Array.isArray(request)) return structuredClone(request);
  if (!request || typeof request !== 'object') {
    const error = new Error('COUNCIL_REQUEST_REQUIRED');
    error.code = 'COUNCIL_REQUEST_REQUIRED';
    error.status = 400;
    throw error;
  }
  if (Array.isArray(request.messages) && request.messages.length) {
    return request.messages.map(message => ({
      role: clean(message?.role) || 'user',
      content: String(message?.content ?? ''),
    }));
  }
  const prompt = clean(request.prompt ?? request.input ?? request.goal);
  if (prompt) return prompt;
  return structuredClone(request);
}

function benchmarkFor(provider, benchmarks = {}) {
  const identity = providerIdentity(provider);
  const source = benchmarks?.[identity]
    ?? benchmarks?.[provider?.id]
    ?? provider?.benchmark
    ?? provider?.benchmarkEvidence
    ?? null;
  if (!source || typeof source !== 'object') return null;
  const overall = finiteOrNull(source.overall ?? source.score);
  if (overall == null) return null;
  return {
    overall,
    suite_id: clean(source.suite_id ?? source.suite) || null,
    suite_digest: clean(source.suite_digest) || null,
    source: clean(source.source) || null,
    domains: source.domains && typeof source.domains === 'object'
      ? structuredClone(source.domains)
      : null,
  };
}

function costMetadata(provider, evaluation) {
  const provenance = provider?.costProvenance ?? provider?.cost_provenance ?? null;
  return {
    policy: ZERO_EURO_POLICY,
    allowed: evaluation?.allowed === true,
    decision_code: evaluation?.code || null,
    estimated_cost: finiteOrNull(provider?.estimatedCost ?? provider?.cost),
    added_cost: finiteOrNull(provenance?.addedCost ?? provenance?.added_cost),
    provenance_source: clean(provenance?.source) || null,
  };
}

function extractText(response) {
  if (typeof response === 'string') return response.trim();
  const value = response?.text
    ?? response?.response
    ?? response?.message?.content
    ?? response?.choices?.[0]?.message?.content
    ?? null;
  return typeof value === 'string' ? value.trim() : '';
}

function extractDeclaredStance(response) {
  const stance = clean(response?.stance ?? response?.position ?? response?.verdict);
  return stance || null;
}

function buildConsensusMetadata(critiques) {
  const declared = critiques
    .map(row => row.declared_stance)
    .filter(Boolean)
    .map(value => value.toLowerCase());
  const distinct = [...new Set(declared)];
  if (distinct.length > 1) {
    return {
      status: 'CONTRADICTORY',
      inferred_consensus: false,
      declared_stances: distinct,
    };
  }
  return {
    status: declared.length >= 2 ? 'ALIGNED_DECLARED_STANCE_ONLY' : 'NOT_ESTABLISHED',
    inferred_consensus: false,
    declared_stances: distinct,
  };
}

function buildBenchmarkComparison(critiques) {
  const rows = critiques
    .filter(row => row.benchmark && Number.isFinite(Number(row.benchmark.overall)))
    .map(row => ({
      identity: row.identity,
      provider: row.provenance.provider,
      model: row.provenance.model,
      overall: Number(row.benchmark.overall),
      suite_id: row.benchmark.suite_id,
      suite_digest: row.benchmark.suite_digest,
    }))
    .sort((a, b) => a.identity.localeCompare(b.identity));
  const suiteKeys = new Set(rows.map(row => `${row.suite_id || ''}::${row.suite_digest || ''}`));
  const suiteIdentified = rows.every(row => Boolean(row.suite_id || row.suite_digest));
  return {
    comparable: rows.length >= 2 && suiteIdentified && suiteKeys.size === 1,
    models: rows,
  };
}

function synthesisInput({ request, critiques, failures, consensus, benchmarkComparison }) {
  const compact = critiques.map(row => ({
    identity: row.identity,
    provider: row.provenance.provider,
    model: row.provenance.model,
    text: row.text,
    declared_stance: row.declared_stance,
    benchmark: row.benchmark,
    latency_ms: row.latency_ms,
    cost: row.cost,
  }));
  return [
    'Tu es MEL, coordinatrice du Model Council.',
    'Les réponses suivantes sont des critiques indépendantes provenant de couples provider/modèle uniques.',
    'Produis une synthèse distincte des critiques. Ne crée jamais de faux consensus.',
    'Signale explicitement les désaccords, incertitudes, échecs providers et limites de preuve.',
    'Ne transforme pas une majorité en vérité et ne compte jamais deux fois le même provider/modèle.',
    'DEMANDE STRUCTURÉE:',
    JSON.stringify(request),
    'CRITIQUES:',
    JSON.stringify(compact),
    'ÉCHECS:',
    JSON.stringify(failures),
    'CONSENSUS MÉTADONNÉ:',
    JSON.stringify(consensus),
    'BENCHMARKS:',
    JSON.stringify(benchmarkComparison),
    'Réponds avec une synthèse exploitable par MEL: POINTS SOLIDES, DÉSACCORDS, INCERTITUDES, OPTIONS, SYNTHÈSE.',
  ].join('\n');
}

function noProviderError(code, { rejections = [], failures = [] } = {}) {
  const error = new Error(code);
  error.code = code;
  error.status = 503;
  error.rejections = rejections;
  error.failures = failures;
  return error;
}

function createScheduler(timeoutMs, maxCandidates) {
  return new ParallelScheduler({
    timeoutMs: Math.max(1, Number(timeoutMs) || DEFAULT_TIMEOUT_MS),
    retries: 0,
    globalConcurrency: Math.max(1, Number(maxCandidates) || DEFAULT_MAX_CANDIDATES),
    perProviderConcurrency: 1,
  });
}

function candidateSelection(pool, capability, governor, maxCandidates) {
  const eligible = [];
  const rejections = [];
  const identities = new Set();
  const listed = pool?.list?.({ capability }) || [];

  for (const provider of listed) {
    const evaluation = governor.evaluate(provider);
    const identity = providerIdentity(provider);
    if (!evaluation.allowed) {
      rejections.push({
        adapter_id: clean(provider?.id) || null,
        identity,
        code: evaluation.code,
      });
      continue;
    }
    if (identities.has(identity)) {
      rejections.push({
        adapter_id: clean(provider?.id) || null,
        identity,
        code: 'COUNCIL_DUPLICATE_PROVIDER_MODEL',
      });
      continue;
    }
    identities.add(identity);
    eligible.push(provider);
    if (eligible.length >= Math.max(1, Number(maxCandidates) || DEFAULT_MAX_CANDIDATES)) break;
  }

  return { eligible, rejections };
}

async function synthesizeCouncil({
  critiques,
  eligibleByIdentity,
  request,
  failures,
  consensus,
  benchmarkComparison,
  governor,
  timeoutMs,
  signal,
}) {
  const input = synthesisInput({ request, critiques, failures, consensus, benchmarkComparison });
  const providers = critiques
    .map(row => eligibleByIdentity.get(row.identity))
    .filter(Boolean);
  const attempted = [];

  for (const provider of providers) {
    const identity = providerIdentity(provider);
    attempted.push(identity);
    try {
      governor.assertAllowed(provider);
      const scheduler = createScheduler(timeoutMs, 1);
      const [settled] = await scheduler.run([provider], async (candidate, _index, meta = {}) => {
        const startedAt = Date.now();
        const response = await candidate.invoke({
          input,
          context: {
            purpose: 'model-council-synthesis',
            coordinator: 'MEL',
            independent_response_count: critiques.length,
          },
          capability: 'GENERAL',
          signal: meta.signal,
        });
        const text = extractText(response);
        if (!text) {
          const error = new Error('COUNCIL_EMPTY_SYNTHESIS');
          error.code = 'COUNCIL_EMPTY_SYNTHESIS';
          throw error;
        }
        return {
          text,
          latency_ms: Date.now() - startedAt,
          provenance: canonicalProvenance(candidate, response),
          cost: costMetadata(candidate, governor.evaluate(candidate)),
        };
      }, {
        getProviderId: candidate => clean(candidate?.id) || providerIdentity(candidate),
        getProviderConcurrency: () => 1,
        signal,
      });

      if (settled?.status === 'fulfilled') {
        return {
          status: 'COMPLETE',
          coordinator: 'MEL',
          attempted,
          ...settled.value,
        };
      }
    } catch {
      // Try another already-successful provider, under the same zero-euro gate.
    }
  }

  const error = new Error('COUNCIL_SYNTHESIS_FAILED');
  error.code = 'COUNCIL_SYNTHESIS_FAILED';
  error.status = 503;
  error.attempted = attempted;
  throw error;
}

/**
 * Provider-neutral Model Council runtime.
 *
 * One independent critique is collected per unique provider/model identity.
 * The synthesis is a separate MEL stage and is never counted as an additional
 * independent Council member.
 */
export async function runModelCouncil({
  env,
  pool,
  request,
  capability = 'GENERAL',
  maxCandidates = DEFAULT_MAX_CANDIDATES,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  governor = new ZeroEuroGovernor(),
  benchmarks = {},
  signal,
} = {}) {
  const normalizedRequest = normalizedInput(request);
  let providerPool = pool;
  if (!providerPool) {
    try {
      providerPool = createDefaultAugmentioPool(env);
    } catch (error) {
      throw noProviderError('COUNCIL_PROVIDER_POOL_UNAVAILABLE', {
        failures: [{ code: errorCode(error, 'PROVIDER_POOL_UNAVAILABLE') }],
      });
    }
  }

  await providerPool.refreshHealth?.();
  const { eligible, rejections } = candidateSelection(providerPool, capability, governor, maxCandidates);
  if (!eligible.length) {
    throw noProviderError('COUNCIL_NO_ELIGIBLE_PROVIDER', { rejections });
  }

  const scheduler = createScheduler(timeoutMs, eligible.length);
  const settled = await scheduler.run(eligible, async (provider, _index, meta = {}) => {
    // Revalidate immediately before each call. Cost metadata is mutable and a
    // selection-time decision must never authorize a later paid invocation.
    governor.assertAllowed(provider);
    const startedAt = Date.now();
    const response = await provider.invoke({
      input: normalizedRequest,
      context: {
        purpose: 'model-council-independent-critique',
        independence_policy: 'ONE_CRITIQUE_PER_UNIQUE_PROVIDER_MODEL',
      },
      capability,
      signal: meta.signal,
    });
    const text = extractText(response);
    if (!text) {
      const error = new Error('EMPTY_PROVIDER_RESPONSE');
      error.code = 'EMPTY_PROVIDER_RESPONSE';
      throw error;
    }
    return {
      identity: providerIdentity(provider),
      text,
      declared_stance: extractDeclaredStance(response),
      latency_ms: Date.now() - startedAt,
      provenance: canonicalProvenance(provider, response),
      cost: costMetadata(provider, governor.evaluate(provider)),
      benchmark: benchmarkFor(provider, benchmarks),
    };
  }, {
    getProviderId: provider => clean(provider?.id) || providerIdentity(provider),
    getProviderConcurrency: () => 1,
    signal,
  });

  const critiques = settled
    .filter(row => row?.status === 'fulfilled')
    .map(row => row.value)
    .sort((a, b) => a.identity.localeCompare(b.identity));

  const failures = settled
    .map((row, index) => row?.status === 'rejected'
      ? {
          identity: providerIdentity(eligible[index]),
          adapter_id: clean(eligible[index]?.id) || null,
          code: errorCode(row.reason),
          latency_ms: row.reason?.code === 'PROVIDER_TIMEOUT'
            ? Math.max(1, Number(timeoutMs) || DEFAULT_TIMEOUT_MS)
            : null,
        }
      : null)
    .filter(Boolean)
    .sort((a, b) => a.identity.localeCompare(b.identity));

  if (!critiques.length) {
    throw noProviderError('COUNCIL_ALL_PROVIDERS_FAILED', { rejections, failures });
  }

  const consensus = buildConsensusMetadata(critiques);
  const benchmarkComparison = buildBenchmarkComparison(critiques);
  const eligibleByIdentity = new Map(eligible.map(provider => [providerIdentity(provider), provider]));
  const synthesis = await synthesizeCouncil({
    critiques,
    eligibleByIdentity,
    request: normalizedRequest,
    failures,
    consensus,
    benchmarkComparison,
    governor,
    timeoutMs,
    signal,
  });

  return {
    schema: 'mel.model-council',
    version: 1,
    status: critiques.length >= 2 ? 'COMPLETE' : 'DEGRADED_SINGLE_MODEL',
    capability,
    request: normalizedRequest,
    independent_response_count: critiques.length,
    unique_model_count: critiques.length,
    provider_failure_count: failures.length,
    strategy: critiques.length >= 2
      ? 'MULTI_MODEL_INDEPENDENT_CRITIQUES_THEN_MEL_SYNTHESIS'
      : 'SINGLE_MODEL_EVIDENCE_THEN_EXPLICITLY_DEGRADED_MEL_SYNTHESIS',
    critiques,
    failures,
    rejections: [...rejections].sort((a, b) => a.identity.localeCompare(b.identity)),
    consensus,
    benchmark_comparison: benchmarkComparison,
    synthesis,
    audit: [
      ...critiques.map(row => ({
        event: 'COUNCIL_CRITIQUE_COMPLETE',
        identity: row.identity,
        latency_ms: row.latency_ms,
      })),
      ...failures.map(row => ({
        event: 'COUNCIL_CRITIQUE_FAILED',
        identity: row.identity,
        code: row.code,
      })),
      {
        event: 'COUNCIL_SYNTHESIS_COMPLETE',
        identity: `${synthesis.provenance?.provider || 'unknown'}::${synthesis.provenance?.model || 'unknown'}`,
        latency_ms: synthesis.latency_ms,
      },
    ],
  };
}

export function createConnectedModelCouncil(config = {}) {
  return Object.freeze({
    queryMultiple: (input = {}, context = {}) => runModelCouncil({
      ...config,
      request: input,
      signal: context.signal ?? config.signal,
    }),
    compare: async (input = {}, context = {}) => {
      const result = await runModelCouncil({
        ...config,
        request: input,
        signal: context.signal ?? config.signal,
      });
      return {
        critiques: result.critiques,
        failures: result.failures,
        consensus: result.consensus,
        benchmark_comparison: result.benchmark_comparison,
      };
    },
    score: async (input = {}, context = {}) => {
      const result = await runModelCouncil({
        ...config,
        request: input,
        signal: context.signal ?? config.signal,
      });
      return result.benchmark_comparison;
    },
    synthesize: async (input = {}, context = {}) => {
      const result = await runModelCouncil({
        ...config,
        request: input,
        signal: context.signal ?? config.signal,
      });
      return result.synthesis;
    },
  });
}

/** Backward-compatible adapter port for callers that explicitly provide methods. */
export const createModelCouncil = adapters => port('models/model-council', methods, adapters);
