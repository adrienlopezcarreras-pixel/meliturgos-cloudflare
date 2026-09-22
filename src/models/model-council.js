import { port } from '../core/contracts.js';
import { createDefaultAugmentioPool } from '../augmentio/default-pool.js';
import { ParallelScheduler } from '../augmentio/parallel-scheduler.js';
import { ZeroEuroGovernor } from '../augmentio/zero-euro-governor.js';

export const methods = ["queryMultiple", "compare", "score", "synthesize"];

function clean(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function codeOf(error) {
  return clean(error?.code || error?.reason || error?.message) || 'PROVIDER_FAILED';
}

function finiteCost(value) {
  if (value == null || (typeof value === 'string' && !value.trim())) return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function canonicalIdentity(provider = {}) {
  return {
    adapter_id: clean(provider.id),
    provider: clean(provider.providerId ?? provider.provider_id ?? provider.id),
    model: clean(provider.modelId ?? provider.model_id ?? provider.id),
  };
}

function identityKey(provider = {}) {
  const identity = canonicalIdentity(provider);
  return `${identity.provider}::${identity.model}`;
}

function safeCostMetadata(provider = {}) {
  const provenance = provider.costProvenance ?? provider.cost_provenance;
  const authorization = provenance && typeof provenance === 'object' && !Array.isArray(provenance)
    ? provenance.authorization
    : null;
  return {
    estimated_cost_eur: finiteCost(provider.estimatedCost ?? provider.cost),
    zero_cost_verified: provenance?.verified === true && Number(provenance?.addedCost ?? provenance?.added_cost) === 0,
    source: clean(provenance?.source) || null,
    authorization: authorization && typeof authorization === 'object' && !Array.isArray(authorization)
      ? {
          approved: authorization.approved === true,
          policy: clean(authorization.policy) || null,
          authority: clean(authorization.authority) || null,
        }
      : null,
  };
}

function safeUpstreamProvenance(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return {
    provider: clean(value.provider) || null,
    model: clean(value.model) || null,
    request_id: clean(value.request_id ?? value.requestId) || null,
  };
}

function normalizeRequest(request) {
  if (typeof request === 'string') request = { prompt: request };
  if (!request || typeof request !== 'object' || Array.isArray(request)) {
    throw Object.assign(new Error('COUNCIL_REQUEST_REQUIRED'), { code: 'COUNCIL_REQUEST_REQUIRED' });
  }
  const prompt = clean(request.prompt ?? request.input ?? request.goal);
  if (!prompt) throw Object.assign(new Error('COUNCIL_REQUEST_REQUIRED'), { code: 'COUNCIL_REQUEST_REQUIRED' });
  return {
    prompt,
    task_type: clean(request.task_type ?? request.taskType) || 'GENERAL',
    context: request.context && typeof request.context === 'object' && !Array.isArray(request.context)
      ? structuredClone(request.context)
      : {},
    request_id: clean(request.request_id ?? request.requestId) || null,
  };
}

function critiquePrompt(request) {
  return [
    'You are one independent member of MELITURGOS Model Council.',
    'Answer only from the request below. Do not assume or imitate any other council member.',
    'State uncertainty and contradictions explicitly. Do not claim consensus.',
    'REQUEST:',
    JSON.stringify(request),
  ].join('\n');
}

function synthesisPrompt(request, critiques, basis) {
  return [
    'You are MEL, synthesizing already-completed independent Model Council critiques.',
    'Do not invent consensus. Preserve disagreements, uncertainty, provider/model attribution and important caveats.',
    basis === 'SINGLE_SOURCE'
      ? 'Only one independent critique succeeded. Treat it as a single source, never as consensus.'
      : 'Multiple independent critiques succeeded. Distinguish agreement from disagreement.',
    'REQUEST:',
    JSON.stringify(request),
    'CRITIQUES:',
    JSON.stringify(critiques.map(row => ({
      provider: row.provenance.provider,
      model: row.provenance.model,
      text: row.text,
      benchmark: row.benchmark,
    }))),
  ].join('\n');
}

function deterministicCritiqueSort(a, b) {
  return a.provenance.provider.localeCompare(b.provenance.provider)
    || a.provenance.model.localeCompare(b.provenance.model)
    || a.provenance.adapter_id.localeCompare(b.provenance.adapter_id);
}

function deterministicFailureSort(a, b) {
  return a.provider.localeCompare(b.provider)
    || a.model.localeCompare(b.model)
    || a.adapter_id.localeCompare(b.adapter_id);
}

function normalizeBenchmark(value) {
  if (value == null) return null;
  if (typeof value === 'number') {
    return Number.isFinite(value) ? { score: value } : null;
  }
  if (typeof value !== 'object' || Array.isArray(value)) return null;
  const score = Number(value.score);
  return {
    score: Number.isFinite(score) ? score : null,
    suite_id: clean(value.suite_id ?? value.suiteId) || null,
    case_id: clean(value.case_id ?? value.caseId) || null,
    evidence: value.evidence ?? null,
  };
}

export class ModelCouncil {
  constructor({
    pool,
    governor = new ZeroEuroGovernor(),
    scheduler = new ParallelScheduler({ retries: 0 }),
    benchmark = null,
    now = () => Date.now(),
  } = {}) {
    if (!pool || typeof pool.list !== 'function') throw new TypeError('COUNCIL_PROVIDER_POOL_REQUIRED');
    this.pool = pool;
    this.governor = governor;
    this.scheduler = scheduler;
    this.benchmark = benchmark;
    this.now = now;
  }

  async eligibleProviders(capability = 'GENERAL', maxMembers = 4) {
    await this.pool.refreshHealth?.();
    const listed = this.pool.list({ capability });
    const providers = [];
    const excluded = [];
    const seenModels = new Set();

    for (const provider of listed) {
      const identity = canonicalIdentity(provider);
      const cost = this.governor.evaluate(provider);
      if (!cost.allowed) {
        excluded.push({ ...identity, reason: cost.code });
        continue;
      }

      const key = identityKey(provider);
      if (seenModels.has(key)) {
        excluded.push({ ...identity, reason: 'DUPLICATE_PROVIDER_MODEL' });
        continue;
      }
      seenModels.add(key);
      providers.push(provider);
      if (providers.length >= Math.max(1, Number(maxMembers) || 4)) break;
    }

    return {
      providers,
      excluded: excluded.sort(deterministicFailureSort),
    };
  }

  async run({
    request,
    capability = 'GENERAL',
    maxMembers = 4,
    minResponses = 1,
    synthesize = true,
    signal,
  } = {}) {
    const normalizedRequest = normalizeRequest(request);
    const selection = await this.eligibleProviders(capability, maxMembers);
    const providers = selection.providers;

    if (!providers.length) {
      const error = Object.assign(new Error('COUNCIL_NO_PROVIDER_AVAILABLE'), {
        code: 'COUNCIL_NO_PROVIDER_AVAILABLE',
        excluded: selection.excluded,
      });
      throw error;
    }

    const settled = await this.scheduler.run(providers, async (provider, _index, meta = {}) => {
      const identity = canonicalIdentity(provider);
      this.governor.assertAllowed(provider);
      const started = this.now();
      const response = await provider.invoke({
        input: critiquePrompt(normalizedRequest),
        context: {
          purpose: 'model-council-critique',
          task_type: normalizedRequest.task_type,
          request_id: normalizedRequest.request_id,
          council_independent: true,
        },
        signal: meta.signal,
      });
      const text = clean(typeof response === 'string' ? response : response?.text ?? response?.response);
      if (!text) throw Object.assign(new Error('EMPTY_PROVIDER_RESPONSE'), { code: 'EMPTY_PROVIDER_RESPONSE' });
      const latencyMs = Math.max(0, this.now() - started);
      const benchmark = typeof this.benchmark === 'function'
        ? normalizeBenchmark(await this.benchmark({
            request: structuredClone(normalizedRequest),
            response: text,
            provider: structuredClone(identity),
          }))
        : null;

      return {
        text,
        latency_ms: latencyMs,
        cost: safeCostMetadata(provider),
        benchmark,
        provenance: {
          ...identity,
          upstream: safeUpstreamProvenance(response?.provenance),
        },
      };
    }, { signal });

    const critiques = [];
    const failures = [];
    settled.forEach((row, index) => {
      const provider = providers[index];
      const identity = canonicalIdentity(provider);
      if (row?.status === 'fulfilled') {
        critiques.push(row.value);
      } else {
        failures.push({ ...identity, code: codeOf(row?.reason) });
      }
    });
    critiques.sort(deterministicCritiqueSort);
    failures.sort(deterministicFailureSort);

    if (!critiques.length) {
      const error = Object.assign(new Error('COUNCIL_ALL_PROVIDERS_FAILED'), {
        code: 'COUNCIL_ALL_PROVIDERS_FAILED',
        failures,
        excluded: selection.excluded,
      });
      throw error;
    }

    const quorum = Math.max(1, Number(minResponses) || 1);
    const result = {
      status: critiques.length >= quorum && failures.length === 0 ? 'COMPLETE' : 'PARTIAL',
      request: normalizedRequest,
      capability: String(capability || 'GENERAL'),
      critiques,
      failures,
      excluded: selection.excluded,
      providers_attempted: providers.map(canonicalIdentity).sort(deterministicFailureSort),
      distinct_models: critiques.length,
      requested_min_responses: quorum,
      quorum_met: critiques.length >= quorum,
      consensus: {
        status: 'NOT_INFERRED',
        reason: 'Council preserves independent answers and does not infer semantic consensus automatically.',
      },
      benchmark: {
        comparable: critiques.some(row => row.benchmark?.score != null),
        scores: critiques
          .filter(row => row.benchmark?.score != null)
          .map(row => ({
            provider: row.provenance.provider,
            model: row.provenance.model,
            score: row.benchmark.score,
            suite_id: row.benchmark.suite_id,
            case_id: row.benchmark.case_id,
          })),
      },
      synthesis: null,
    };

    if (synthesize) {
      result.synthesis = await this.synthesize({
        request: normalizedRequest,
        critiques,
        providers,
        signal,
      });
      if (result.synthesis.status !== 'COMPLETE') result.status = 'PARTIAL';
    }

    return result;
  }

  async synthesize({ request, critiques, providers, signal } = {}) {
    const basis = critiques.length === 1 ? 'SINGLE_SOURCE' : 'MULTI_SOURCE';
    const attempted = [];
    const failures = [];
    const input = synthesisPrompt(request, critiques, basis);

    for (const provider of providers) {
      const identity = canonicalIdentity(provider);
      attempted.push(identity);
      const started = this.now();
      const settled = await this.scheduler.run([provider], async (candidate, _index, meta = {}) => {
        this.governor.assertAllowed(candidate);
        const response = await candidate.invoke({
          input,
          context: {
            purpose: 'model-council-synthesis',
            task_type: request.task_type,
            request_id: request.request_id,
            synthesis_basis: basis,
          },
          signal: meta.signal,
        });
        const text = clean(typeof response === 'string' ? response : response?.text ?? response?.response);
        if (!text) throw Object.assign(new Error('EMPTY_PROVIDER_RESPONSE'), { code: 'EMPTY_PROVIDER_RESPONSE' });
        return { response, text };
      }, { signal });

      const outcome = settled[0];
      if (outcome?.status === 'fulfilled') {
        return {
          status: 'COMPLETE',
          coordinator: 'MEL',
          basis,
          text: outcome.value.text,
          latency_ms: Math.max(0, this.now() - started),
          cost: safeCostMetadata(provider),
          provenance: {
            ...identity,
            upstream: safeUpstreamProvenance(outcome.value.response?.provenance),
          },
          attempted,
          failures,
        };
      }
      failures.push({ ...identity, code: codeOf(outcome?.reason) });
    }

    return {
      status: 'UNAVAILABLE',
      coordinator: 'MEL',
      basis,
      text: '',
      latency_ms: null,
      cost: null,
      provenance: null,
      attempted,
      failures: failures.sort(deterministicFailureSort),
    };
  }
}

export function createRuntimeModelCouncil({
  env,
  pool,
  governor = new ZeroEuroGovernor(),
  scheduler = new ParallelScheduler({ retries: 0 }),
  benchmark = null,
  now,
} = {}) {
  const providerPool = pool || createDefaultAugmentioPool(env);
  return new ModelCouncil({ pool: providerPool, governor, scheduler, benchmark, now });
}

/**
 * Compatibility port retained for callers that inject their own Council
 * implementation. New runtime code should prefer ModelCouncil or
 * createRuntimeModelCouncil so provider selection, provenance and zero-euro
 * enforcement share the canonical provider infrastructure.
 */
export const createModelCouncil = adapters => port('models/model-council', methods, adapters);
