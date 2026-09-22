import test from 'node:test';
import assert from 'node:assert/strict';

import { ProviderPool } from '../src/augmentio/provider-pool.js';
import { ParallelScheduler } from '../src/augmentio/parallel-scheduler.js';
import { ZERO_EURO_POLICY } from '../src/augmentio/zero-euro-governor.js';
import { ModelCouncil, createRuntimeModelCouncil } from '../src/models/model-council.js';

function verifiedFree(id, providerId, modelId) {
  return {
    verified: true,
    addedCost: 0,
    source: 'model-council-test-zero-cost',
    authorization: {
      approved: true,
      policy: ZERO_EURO_POLICY,
      authority: 'model-council-test-suite',
      adapter_id: id,
      provider: providerId,
      model: modelId,
    },
  };
}

function provider({
  id,
  providerId = id,
  modelId = id,
  calls = [],
  text = `answer-${id}`,
  delayMs = 0,
  fail = false,
  failCritique = false,
  failSynthesis = false,
  estimatedCost = 0,
  costProvenance,
  upstreamProvenance,
} = {}) {
  const provenance = costProvenance === undefined
    ? (estimatedCost === 0 ? verifiedFree(id, providerId, modelId) : null)
    : costProvenance;

  return {
    id,
    providerId,
    modelId,
    capabilities: ['GENERAL'],
    estimatedCost,
    costProvenance: provenance,
    priority: 0,
    concurrency: 4,
    enabled: true,
    healthStatus: 'HEALTHY',
    health: async () => 'HEALTHY',
    invoke: async ({ input, context = {}, signal }) => {
      calls.push({ id, providerId, modelId, purpose: context.purpose, input });
      if (delayMs) {
        await new Promise((resolve, reject) => {
          const timer = setTimeout(resolve, delayMs);
          signal?.addEventListener?.('abort', () => {
            clearTimeout(timer);
            reject(Object.assign(new Error('ABORTED'), { code: 'ABORTED' }));
          }, { once: true });
        });
      }
      if (fail || (failCritique && context.purpose === 'model-council-critique') || (failSynthesis && context.purpose === 'model-council-synthesis')) {
        throw Object.assign(new Error(`FAILED_${id}`), { code: `FAILED_${id}` });
      }
      return {
        text: context.purpose === 'model-council-synthesis' ? `synthesis-${id}` : text,
        provenance: upstreamProvenance || { provider: providerId, model: modelId },
      };
    },
  };
}

function council(providers, options = {}) {
  return new ModelCouncil({
    pool: new ProviderPool(providers),
    scheduler: options.scheduler || new ParallelScheduler({ timeoutMs: 100, retries: 0 }),
    benchmark: options.benchmark || null,
    now: options.now,
  });
}

test('multiple distinct providers answer independently and MEL synthesis runs only after critiques', async () => {
  const calls = [];
  const subject = council([
    provider({ id: 'a1', providerId: 'alpha', modelId: 'm1', calls, text: 'alpha view' }),
    provider({ id: 'b1', providerId: 'beta', modelId: 'm2', calls, text: 'beta view' }),
  ]);

  const result = await subject.run({
    request: { prompt: 'compare approaches', taskType: 'GENERAL', requestId: 'r-1' },
    minResponses: 2,
  });

  assert.equal(result.status, 'COMPLETE');
  assert.equal(result.critiques.length, 2);
  assert.equal(result.quorum_met, true);
  assert.equal(result.synthesis.status, 'COMPLETE');
  assert.equal(result.synthesis.coordinator, 'MEL');
  assert.equal(result.synthesis.basis, 'MULTI_SOURCE');

  const purposes = calls.map(row => row.purpose);
  const firstSynthesis = purposes.indexOf('model-council-synthesis');
  assert.ok(firstSynthesis >= 2);
  assert.ok(purposes.slice(0, firstSynthesis).every(value => value === 'model-council-critique'));
  assert.ok(calls.filter(row => row.purpose === 'model-council-critique').every(row => !row.input.includes('CRITIQUES:')));
});

test('one provider failure is isolated and returns a partial result with the surviving critique', async () => {
  const calls = [];
  const subject = council([
    provider({ id: 'a', providerId: 'alpha', modelId: 'm1', calls }),
    provider({ id: 'b', providerId: 'beta', modelId: 'm2', calls, failCritique: true }),
  ]);

  const result = await subject.run({ request: 'isolate provider failure', minResponses: 2, synthesize: false });
  assert.equal(result.status, 'PARTIAL');
  assert.equal(result.critiques.length, 1);
  assert.equal(result.failures.length, 1);
  assert.equal(result.failures[0].provider, 'beta');
  assert.equal(result.quorum_met, false);
});

test('multiple provider failures still preserve a surviving response', async () => {
  const subject = council([
    provider({ id: 'a', providerId: 'alpha', modelId: 'm1' }),
    provider({ id: 'b', providerId: 'beta', modelId: 'm2', failCritique: true }),
    provider({ id: 'c', providerId: 'gamma', modelId: 'm3', failCritique: true }),
  ]);

  const result = await subject.run({ request: 'keep partial result', minResponses: 3, synthesize: false });
  assert.equal(result.status, 'PARTIAL');
  assert.equal(result.critiques.length, 1);
  assert.equal(result.failures.length, 2);
  assert.deepEqual(result.failures.map(row => row.provider), ['beta', 'gamma']);
});

test('provider timeout is isolated and reported without hiding successful peers', async () => {
  const subject = council([
    provider({ id: 'slow', providerId: 'slow-provider', modelId: 'slow-model', delayMs: 80 }),
    provider({ id: 'fast', providerId: 'fast-provider', modelId: 'fast-model' }),
  ], {
    scheduler: new ParallelScheduler({ timeoutMs: 15, retries: 0 }),
  });

  const result = await subject.run({ request: 'timeout test', minResponses: 2, synthesize: false });
  assert.equal(result.status, 'PARTIAL');
  assert.equal(result.critiques.length, 1);
  assert.equal(result.critiques[0].provenance.provider, 'fast-provider');
  assert.equal(result.failures.length, 1);
  assert.equal(result.failures[0].provider, 'slow-provider');
  assert.match(result.failures[0].code, /PROVIDER_TIMEOUT|ABORTED/);
});

test('duplicate adapters for the same provider/model are never double counted', async () => {
  const calls = [];
  const subject = council([
    provider({ id: 'adapter-a', providerId: 'same-provider', modelId: 'same-model', calls }),
    provider({ id: 'adapter-b', providerId: 'same-provider', modelId: 'same-model', calls }),
    provider({ id: 'other', providerId: 'other-provider', modelId: 'other-model', calls }),
  ]);

  const result = await subject.run({ request: 'dedupe models', synthesize: false, maxMembers: 5 });
  assert.equal(result.critiques.length, 2);
  assert.equal(result.distinct_models, 2);
  assert.equal(result.excluded.filter(row => row.reason === 'DUPLICATE_PROVIDER_MODEL').length, 1);
  assert.equal(calls.filter(row => row.purpose === 'model-council-critique').length, 2);
});

test('non-zero cost provider is excluded by the zero-euro governor', async () => {
  const paid = provider({
    id: 'paid',
    providerId: 'paid-provider',
    modelId: 'paid-model',
    estimatedCost: 0.01,
    costProvenance: {
      verified: true,
      addedCost: 0.01,
      source: 'price-list',
      authorization: {
        approved: true,
        policy: ZERO_EURO_POLICY,
        authority: 'test',
        adapter_id: 'paid',
        provider: 'paid-provider',
        model: 'paid-model',
      },
    },
  });
  const subject = council([paid, provider({ id: 'free', providerId: 'free-provider', modelId: 'free-model' })]);

  const result = await subject.run({ request: 'cost guard', synthesize: false });
  assert.equal(result.critiques.length, 1);
  assert.equal(result.critiques[0].provenance.provider, 'free-provider');
  assert.ok(result.excluded.some(row => row.provider === 'paid-provider' && /NOT_ZERO|BUDGET/.test(row.reason)));
});

test('unknown cost fails closed when zero-euro policy applies', async () => {
  const unknown = provider({
    id: 'unknown',
    providerId: 'unknown-provider',
    modelId: 'unknown-model',
    estimatedCost: null,
    costProvenance: null,
  });
  const subject = council([unknown]);

  await assert.rejects(
    () => subject.run({ request: 'unknown cost', synthesize: false }),
    error => error.code === 'COUNCIL_NO_PROVIDER_AVAILABLE'
      && error.excluded.some(row => row.provider === 'unknown-provider' && row.reason.startsWith('ZERO_EURO_'))
  );
});

test('contradictory critiques are preserved and never converted into fake consensus', async () => {
  const calls = [];
  const subject = council([
    provider({ id: 'yes', providerId: 'alpha', modelId: 'm1', calls, text: 'YES: adopt approach A' }),
    provider({ id: 'no', providerId: 'beta', modelId: 'm2', calls, text: 'NO: reject approach A' }),
  ]);

  const result = await subject.run({ request: 'should we use A?', minResponses: 2 });
  assert.equal(result.consensus.status, 'NOT_INFERRED');
  assert.match(result.consensus.reason, /does not infer/i);
  assert.deepEqual(result.critiques.map(row => row.text), ['YES: adopt approach A', 'NO: reject approach A']);

  const synthesisCall = calls.find(row => row.purpose === 'model-council-synthesis');
  assert.ok(synthesisCall);
  assert.match(synthesisCall.input, /YES: adopt approach A/);
  assert.match(synthesisCall.input, /NO: reject approach A/);
});

test('single surviving model gets an explicit SINGLE_SOURCE synthesis basis', async () => {
  const subject = council([
    provider({ id: 'only', providerId: 'alpha', modelId: 'm1' }),
    provider({ id: 'failed', providerId: 'beta', modelId: 'm2', failCritique: true }),
  ]);

  const result = await subject.run({ request: 'single source policy', minResponses: 2 });
  assert.equal(result.status, 'PARTIAL');
  assert.equal(result.critiques.length, 1);
  assert.equal(result.synthesis.status, 'COMPLETE');
  assert.equal(result.synthesis.basis, 'SINGLE_SOURCE');
  assert.equal(result.consensus.status, 'NOT_INFERRED');
});

test('canonical provenance cannot be spoofed by provider response payload', async () => {
  const subject = council([
    provider({
      id: 'adapter-real',
      providerId: 'real-provider',
      modelId: 'real-model',
      upstreamProvenance: { provider: 'spoof-provider', model: 'spoof-model', request_id: 'upstream-1' },
    }),
  ]);

  const result = await subject.run({ request: 'provenance', synthesize: false });
  const provenance = result.critiques[0].provenance;
  assert.equal(provenance.adapter_id, 'adapter-real');
  assert.equal(provenance.provider, 'real-provider');
  assert.equal(provenance.model, 'real-model');
  assert.deepEqual(provenance.upstream, {
    provider: 'spoof-provider',
    model: 'spoof-model',
    request_id: 'upstream-1',
  });
});

test('variable completion order still produces deterministic critique and failure ordering', async () => {
  const subject = council([
    provider({ id: 'z', providerId: 'zeta', modelId: 'm3', delayMs: 1 }),
    provider({ id: 'a', providerId: 'alpha', modelId: 'm1', delayMs: 20 }),
    provider({ id: 'b', providerId: 'beta', modelId: 'm2', delayMs: 5, failCritique: true }),
  ], {
    scheduler: new ParallelScheduler({ timeoutMs: 100, retries: 0 }),
  });

  const result = await subject.run({ request: 'ordering', synthesize: false, maxMembers: 3 });
  assert.deepEqual(result.critiques.map(row => row.provenance.provider), ['alpha', 'zeta']);
  assert.deepEqual(result.failures.map(row => row.provider), ['beta']);
});

test('benchmark callback yields comparable per-model scores without changing critique provenance', async () => {
  const subject = council([
    provider({ id: 'a', providerId: 'alpha', modelId: 'm1', text: 'good' }),
    provider({ id: 'b', providerId: 'beta', modelId: 'm2', text: 'weak' }),
  ], {
    benchmark: async ({ response, provider: identity }) => ({
      score: response === 'good' ? 0.9 : 0.4,
      suite_id: 'council-test-suite',
      case_id: `case-${identity.model}`,
      evidence: { verified: true },
    }),
  });

  const result = await subject.run({ request: 'benchmark', synthesize: false });
  assert.equal(result.benchmark.comparable, true);
  assert.deepEqual(result.benchmark.scores.map(row => [row.provider, row.score]), [
    ['alpha', 0.9],
    ['beta', 0.4],
  ]);
});

test('all providers failing produces an explicit all-failed error with attribution', async () => {
  const subject = council([
    provider({ id: 'a', providerId: 'alpha', modelId: 'm1', failCritique: true }),
    provider({ id: 'b', providerId: 'beta', modelId: 'm2', failCritique: true }),
  ]);

  await assert.rejects(
    () => subject.run({ request: 'all fail', synthesize: false }),
    error => error.code === 'COUNCIL_ALL_PROVIDERS_FAILED'
      && error.failures.length === 2
      && error.failures[0].provider === 'alpha'
      && error.failures[1].provider === 'beta'
  );
});

test('no provider available produces an explicit fail-closed error', async () => {
  const subject = council([]);
  await assert.rejects(
    () => subject.run({ request: 'none', synthesize: false }),
    error => error.code === 'COUNCIL_NO_PROVIDER_AVAILABLE'
  );
});

test('runtime factory wires the Council to the canonical Workers AI provider adapters', async () => {
  const previous = process.env.MEL_TEST_VERIFIED_ZERO_COST_PROVIDERS;
  process.env.MEL_TEST_VERIFIED_ZERO_COST_PROVIDERS = '1';
  try {
    const seen = [];
    const subject = createRuntimeModelCouncil({
      env: {
        AI: {
          run: async (model, payload) => {
            seen.push({ model, payload });
            return { response: `workers-ai-response-${model}` };
          },
        },
      },
      scheduler: new ParallelScheduler({ timeoutMs: 100, retries: 0 }),
    });

    const result = await subject.run({
      request: { prompt: 'runtime provider wiring', taskType: 'GENERAL' },
      maxMembers: 2,
      minResponses: 2,
      synthesize: false,
    });

    assert.equal(result.status, 'COMPLETE');
    assert.equal(result.critiques.length, 2);
    assert.ok(result.critiques.every(row => row.provenance.provider === 'workers-ai'));
    assert.equal(seen.length, 2);
    assert.equal(new Set(seen.map(row => row.model)).size, 2);
  } finally {
    if (previous === undefined) delete process.env.MEL_TEST_VERIFIED_ZERO_COST_PROVIDERS;
    else process.env.MEL_TEST_VERIFIED_ZERO_COST_PROVIDERS = previous;
  }
});
