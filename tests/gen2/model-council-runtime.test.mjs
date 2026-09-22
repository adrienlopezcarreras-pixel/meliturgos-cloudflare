import test from 'node:test';
import assert from 'node:assert/strict';
import { ProviderPool } from '../../src/augmentio/provider-pool.js';
import { ZERO_EURO_POLICY } from '../../src/augmentio/zero-euro-governor.js';
import { inspectModelCouncilZeroEuroReadiness, runModelCouncil } from '../../src/models/model-council.js';
import { createDefaultCapabilityBus } from '../../src/capabilities/default-bus.js';
import router from '../../src/router.js';

process.env.MEL_TEST_VERIFIED_ZERO_COST_PROVIDERS = '1';

function runtimeZeroEuroAuthorization(modelId, overrides = {}) {
  return {
    adapter_id: `workers-ai:${modelId}`,
    provider: 'workers-ai',
    model: modelId,
    source: 'owner-verified-account-zero-added-cost',
    authority: 'owner-runtime-authorization',
    verified: true,
    approved: true,
    policy: ZERO_EURO_POLICY,
    added_cost: 0,
    ...overrides,
  };
}

function verifiedFree({ id, providerId, modelId }) {
  return Object.freeze({
    verified: true,
    addedCost: 0,
    source: 'gen2-05-model-council-test',
    authorization: Object.freeze({
      approved: true,
      policy: ZERO_EURO_POLICY,
      authority: 'gen2-05-test-suite',
      adapter_id: id,
      provider: providerId,
      model: modelId,
    }),
  });
}

function provider({
  id,
  providerId,
  modelId,
  calls,
  cost = 0,
  costProvenance,
  delayMs = 0,
  failCritique = false,
  failSynthesis = false,
  stance = null,
  reportedProvenance = null,
  benchmark = null,
  healthStatus = 'HEALTHY',
} = {}) {
  const adapter = {
    id,
    providerId,
    modelId,
    capabilities: ['GENERAL'],
    priority: 1,
    estimatedCost: cost,
    costProvenance: costProvenance === undefined
      ? (cost === 0 ? verifiedFree({ id, providerId, modelId }) : null)
      : costProvenance,
    enabled: true,
    healthStatus,
    benchmark,
    health: async () => healthStatus,
    async invoke({ context = {}, signal } = {}) {
      calls.push({ id, providerId, modelId, purpose: context.purpose });
      if (delayMs) {
        await new Promise((resolve, reject) => {
          const timer = setTimeout(resolve, delayMs);
          signal?.addEventListener?.('abort', () => {
            clearTimeout(timer);
            reject(Object.assign(new Error('ABORTED_BY_TIMEOUT'), { code: 'ABORTED_BY_TIMEOUT' }));
          }, { once: true });
        });
      }
      if (context.purpose === 'model-council-synthesis') {
        if (failSynthesis) throw Object.assign(new Error('SYNTHESIS_FAILED'), { code: 'SYNTHESIS_FAILED' });
        return {
          text: `synthesis by ${providerId}/${modelId}`,
          provenance: reportedProvenance || { provider: providerId, model: modelId },
        };
      }
      if (failCritique) throw Object.assign(new Error('CRITIQUE_FAILED'), { code: 'CRITIQUE_FAILED' });
      return {
        text: `critique by ${providerId}/${modelId}`,
        stance,
        provenance: reportedProvenance || { provider: providerId, model: modelId },
      };
    },
  };
  return adapter;
}

test('multiple providers answer independently and MEL synthesis is separate', async () => {
  const calls = [];
  const pool = new ProviderPool([
    provider({ id: 'a1', providerId: 'alpha', modelId: 'm1', calls }),
    provider({ id: 'b1', providerId: 'beta', modelId: 'm2', calls }),
  ]);

  const result = await runModelCouncil({ pool, request: { prompt: 'compare approaches' } });

  assert.equal(result.status, 'COMPLETE');
  assert.equal(result.independent_response_count, 2);
  assert.equal(result.unique_model_count, 2);
  assert.deepEqual(result.critiques.map(row => row.identity), ['alpha::m1', 'beta::m2']);
  assert.equal(result.synthesis.status, 'COMPLETE');
  assert.equal(result.consensus.inferred_consensus, false);

  const critiqueCalls = calls.filter(row => row.purpose === 'model-council-independent-critique');
  const synthesisCalls = calls.filter(row => row.purpose === 'model-council-synthesis');
  assert.equal(critiqueCalls.length, 2);
  assert.equal(synthesisCalls.length, 1);
});


test('default connected Council uses the configured Workers AI adapter path', async () => {
  const calls = [];
  const env = {
    AI: {
      async run(model, payload) {
        calls.push({ model, payload });
        return { response: `workers-ai response from ${model}` };
      },
    },
  };

  const result = await runModelCouncil({
    env,
    request: { prompt: 'prove default provider wiring' },
    maxCandidates: 2,
  });

  assert.equal(result.status, 'COMPLETE');
  assert.equal(result.critiques.length, 2);
  assert.ok(result.critiques.every(row => row.provenance.provider === 'workers-ai'));
  assert.equal(new Set(result.critiques.map(row => row.provenance.model)).size, 2);
  assert.equal(calls.length, 3);
  assert.ok(calls.every(row => row.model.startsWith('@cf/')));
  assert.ok(calls.every(row => Array.isArray(row.payload.messages) && row.payload.messages.length > 0));
});

test('Model Council is registered in the production CapabilityBus and executes through Workers AI adapters', async () => {
  const calls = [];
  const env = {
    AI: {
      async run(model, payload) {
        calls.push({ model, payload });
        return { response: `bus response from ${model}` };
      },
    },
  };
  const bus = createDefaultCapabilityBus({ env });
  const record = bus.describe('model.council');
  assert.equal(record.enabled, true);
  assert.equal(record.risk, 'LOW');
  assert.equal(record.provider, 'mel');

  const result = await bus.execute('model.council', {
    request: { prompt: 'compare via capability bus' },
    capability: 'GENERAL',
    maxCandidates: 2,
    timeoutMs: 5000,
  }, {
    owner: 'gen2-05-test',
    permissions: [],
    requestId: 'gen2-05-capability-bus',
  });

  assert.equal(result.status, 'COMPLETE');
  assert.equal(result.independent_response_count, 2);
  assert.equal(new Set(result.critiques.map(row => row.identity)).size, 2);
  assert.equal(result.synthesis.status, 'COMPLETE');
  assert.equal(calls.length, 3);
});

test('CapabilityBus Model Council remains fail-closed in production-like runtime without explicit zero-euro provenance', async () => {
  const previous = process.env.MEL_TEST_VERIFIED_ZERO_COST_PROVIDERS;
  delete process.env.MEL_TEST_VERIFIED_ZERO_COST_PROVIDERS;
  let externalCalls = 0;
  try {
    const bus = createDefaultCapabilityBus({
      env: {
        AI: {
          async run() {
            externalCalls += 1;
            return { response: 'must not be called' };
          },
        },
      },
    });

    await assert.rejects(
      () => bus.execute('model.council', {
        request: { prompt: 'do not spend without proof' },
        maxCandidates: 2,
      }, {
        owner: 'gen2-05-test',
        permissions: [],
        requestId: 'gen2-05-zero-euro-guard',
      }),
      error => error?.code === 'COUNCIL_NO_ELIGIBLE_PROVIDER'
    );
    assert.equal(externalCalls, 0);
  } finally {
    if (previous === undefined) delete process.env.MEL_TEST_VERIFIED_ZERO_COST_PROVIDERS;
    else process.env.MEL_TEST_VERIFIED_ZERO_COST_PROVIDERS = previous;
  }
});

test('HTTP capability execution route exposes model.council end-to-end', async () => {
  const calls = [];
  const credentials = btoa('owner:test-password');
  const env = {
    MELITURGOS_USER: 'owner',
    MELITURGOS_PASSWORD: 'test-password',
    AI: {
      async run(model, payload) {
        calls.push({ model, payload });
        return { response: `http response from ${model}` };
      },
    },
  };
  const request = new Request('https://mel.test/api/gen2/capabilities/execute', {
    method: 'POST',
    headers: {
      authorization: `Basic ${credentials}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      id: 'model.council',
      input: {
        request: { prompt: 'prove HTTP runtime wiring' },
        capability: 'GENERAL',
        maxCandidates: 2,
        timeoutMs: 5000,
      },
    }),
  });

  const response = await router.fetch(request, env, {});
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.capability, 'model.council');
  assert.equal(body.result.status, 'COMPLETE');
  assert.equal(body.result.independent_response_count, 2);
  assert.equal(body.result.synthesis.status, 'COMPLETE');
  assert.equal(calls.length, 3);
});

test('explicit runtime zero-euro authorization enables exact configured models without the Node test fixture', async () => {
  const previous = process.env.MEL_TEST_VERIFIED_ZERO_COST_PROVIDERS;
  delete process.env.MEL_TEST_VERIFIED_ZERO_COST_PROVIDERS;
  const calls = [];
  const first = '@cf/zai-org/glm-4.7-flash';
  const second = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';
  try {
    const env = {
      MEL_MODEL_COUNCIL_ZERO_EURO_AUTHORIZATIONS: JSON.stringify([
        runtimeZeroEuroAuthorization(first),
        runtimeZeroEuroAuthorization(second),
      ]),
      AI: {
        async run(model, payload) {
          calls.push({ model, payload });
          return { response: `runtime-authorized response from ${model}` };
        },
      },
    };

    const readiness = await inspectModelCouncilZeroEuroReadiness(env, { minimum: 2 });
    assert.equal(readiness.status, 'ONLINE');
    assert.equal(readiness.authorized_zero_cost_count, 2);
    assert.equal(readiness.configured_authorization_count, 2);
    assert.equal(readiness.matched_authorization_count, 2);
    assert.equal(calls.length, 0);

    const bus = createDefaultCapabilityBus({ env });
    const health = await bus.refreshHealth('model.council');
    assert.equal(health.health, 'HEALTHY');

    const result = await bus.execute('model.council', {
      request: { prompt: 'prove runtime zero-euro authorization' },
      maxCandidates: 2,
    }, {
      owner: 'gen2-05-test',
      permissions: [],
      requestId: 'gen2-05-runtime-zero-euro',
    });

    assert.equal(result.status, 'COMPLETE');
    assert.equal(result.independent_response_count, 2);
    assert.equal(result.synthesis.status, 'COMPLETE');
    assert.ok(result.critiques.every(row => row.cost.allowed === true));
    assert.ok(result.critiques.every(row => row.cost.provenance_source === 'owner-verified-account-zero-added-cost'));
    assert.equal(calls.length, 3);
  } finally {
    if (previous === undefined) delete process.env.MEL_TEST_VERIFIED_ZERO_COST_PROVIDERS;
    else process.env.MEL_TEST_VERIFIED_ZERO_COST_PROVIDERS = previous;
  }
});

test('runtime zero-euro authorization is exact-match and cannot authorize a different model', async () => {
  const previous = process.env.MEL_TEST_VERIFIED_ZERO_COST_PROVIDERS;
  delete process.env.MEL_TEST_VERIFIED_ZERO_COST_PROVIDERS;
  let externalCalls = 0;
  try {
    const env = {
      MEL_MODEL_COUNCIL_ZERO_EURO_AUTHORIZATIONS: JSON.stringify([
        runtimeZeroEuroAuthorization('@cf/not-the-configured-model'),
      ]),
      AI: {
        async run() {
          externalCalls += 1;
          return { response: 'must not run' };
        },
      },
    };

    const readiness = await inspectModelCouncilZeroEuroReadiness(env, { minimum: 2 });
    assert.equal(readiness.status, 'SAFE_IDLE');
    assert.equal(readiness.authorized_zero_cost_count, 0);
    assert.equal(readiness.matched_authorization_count, 0);

    await assert.rejects(
      () => runModelCouncil({ env, request: { prompt: 'exact match required' }, maxCandidates: 2 }),
      error => error?.code === 'COUNCIL_NO_ELIGIBLE_PROVIDER'
    );
    assert.equal(externalCalls, 0);
  } finally {
    if (previous === undefined) delete process.env.MEL_TEST_VERIFIED_ZERO_COST_PROVIDERS;
    else process.env.MEL_TEST_VERIFIED_ZERO_COST_PROVIDERS = previous;
  }
});

test('malformed or nonzero runtime authorization fails closed before any inference', async () => {
  const previous = process.env.MEL_TEST_VERIFIED_ZERO_COST_PROVIDERS;
  delete process.env.MEL_TEST_VERIFIED_ZERO_COST_PROVIDERS;
  let externalCalls = 0;
  try {
    const model = '@cf/zai-org/glm-4.7-flash';
    const env = {
      MEL_MODEL_COUNCIL_ZERO_EURO_AUTHORIZATIONS: JSON.stringify([
        runtimeZeroEuroAuthorization(model, { added_cost: 0.01 }),
      ]),
      AI: {
        async run() {
          externalCalls += 1;
          return { response: 'must not run' };
        },
      },
    };

    const readiness = await inspectModelCouncilZeroEuroReadiness(env, { minimum: 2 });
    assert.equal(readiness.status, 'DEGRADED');
    assert.equal(readiness.reason, 'COUNCIL_ZERO_EURO_AUTH_CONFIG_INVALID');

    await assert.rejects(
      () => runModelCouncil({ env, request: { prompt: 'reject nonzero authorization' } }),
      error => error?.code === 'COUNCIL_ZERO_EURO_AUTH_CONFIG_INVALID'
    );
    assert.equal(externalCalls, 0);
  } finally {
    if (previous === undefined) delete process.env.MEL_TEST_VERIFIED_ZERO_COST_PROVIDERS;
    else process.env.MEL_TEST_VERIFIED_ZERO_COST_PROVIDERS = previous;
  }
});

test('one provider failure is isolated and partial multi-model result remains usable', async () => {
  const calls = [];
  const pool = new ProviderPool([
    provider({ id: 'a1', providerId: 'alpha', modelId: 'm1', calls }),
    provider({ id: 'b1', providerId: 'beta', modelId: 'm2', calls, failCritique: true }),
    provider({ id: 'c1', providerId: 'gamma', modelId: 'm3', calls }),
  ]);

  const result = await runModelCouncil({ pool, request: 'isolate failure' });

  assert.equal(result.status, 'COMPLETE');
  assert.equal(result.independent_response_count, 2);
  assert.equal(result.provider_failure_count, 1);
  assert.deepEqual(result.failures.map(row => row.identity), ['beta::m2']);
  assert.equal(result.synthesis.status, 'COMPLETE');
});

test('several provider failures degrade explicitly to one model without fabricating consensus', async () => {
  const calls = [];
  const pool = new ProviderPool([
    provider({ id: 'a1', providerId: 'alpha', modelId: 'm1', calls }),
    provider({ id: 'b1', providerId: 'beta', modelId: 'm2', calls, failCritique: true }),
    provider({ id: 'c1', providerId: 'gamma', modelId: 'm3', calls, failCritique: true }),
  ]);

  const result = await runModelCouncil({ pool, request: 'degraded mode' });

  assert.equal(result.status, 'DEGRADED_SINGLE_MODEL');
  assert.equal(result.independent_response_count, 1);
  assert.equal(result.provider_failure_count, 2);
  assert.match(result.strategy, /SINGLE_MODEL/);
  assert.equal(result.consensus.status, 'NOT_ESTABLISHED');
  assert.equal(result.consensus.inferred_consensus, false);
  assert.equal(result.synthesis.status, 'COMPLETE');
});

test('individual timeout is isolated and recorded without blocking another provider', async () => {
  const calls = [];
  const pool = new ProviderPool([
    provider({ id: 'slow', providerId: 'slow-provider', modelId: 'slow-model', calls, delayMs: 50 }),
    provider({ id: 'fast', providerId: 'fast-provider', modelId: 'fast-model', calls }),
  ]);

  const result = await runModelCouncil({ pool, request: 'timeout check', timeoutMs: 10 });

  assert.equal(result.status, 'DEGRADED_SINGLE_MODEL');
  assert.equal(result.critiques[0].identity, 'fast-provider::fast-model');
  assert.equal(result.failures.length, 1);
  assert.equal(result.failures[0].identity, 'slow-provider::slow-model');
  assert.ok(['PROVIDER_TIMEOUT', 'ABORTED_BY_TIMEOUT'].includes(result.failures[0].code));
});

test('duplicate aliases of the same provider/model are never double counted or called twice', async () => {
  const calls = [];
  const pool = new ProviderPool([
    provider({ id: 'alias-1', providerId: 'alpha', modelId: 'same-model', calls }),
    provider({ id: 'alias-2', providerId: 'alpha', modelId: 'same-model', calls }),
    provider({ id: 'beta-1', providerId: 'beta', modelId: 'other-model', calls }),
  ]);

  const result = await runModelCouncil({ pool, request: 'deduplicate' });

  assert.equal(result.independent_response_count, 2);
  assert.equal(result.unique_model_count, 2);
  assert.ok(result.rejections.some(row => row.code === 'COUNCIL_DUPLICATE_PROVIDER_MODEL'));
  const alphaCritiques = calls.filter(row => row.purpose === 'model-council-independent-critique' && row.providerId === 'alpha');
  assert.equal(alphaCritiques.length, 1);
});

test('paid provider is rejected before invocation under zero-euro policy', async () => {
  const calls = [];
  const pool = new ProviderPool([
    provider({ id: 'paid', providerId: 'paid-provider', modelId: 'paid-model', calls, cost: 0.01 }),
    provider({ id: 'free', providerId: 'free-provider', modelId: 'free-model', calls }),
  ]);

  const result = await runModelCouncil({ pool, request: 'zero euro' });

  assert.equal(result.status, 'DEGRADED_SINGLE_MODEL');
  assert.ok(result.rejections.some(row => row.identity === 'paid-provider::paid-model'));
  assert.equal(calls.some(row => row.id === 'paid'), false);
});

test('unknown cost is fail-closed before provider invocation', async () => {
  const calls = [];
  const unknown = provider({
    id: 'unknown',
    providerId: 'unknown-provider',
    modelId: 'unknown-model',
    calls,
    cost: 0,
  });
  unknown.estimatedCost = null;

  const pool = new ProviderPool([
    unknown,
    provider({ id: 'free', providerId: 'free-provider', modelId: 'free-model', calls }),
  ]);

  const result = await runModelCouncil({ pool, request: 'unknown cost' });

  assert.ok(result.rejections.some(row => row.code === 'ZERO_EURO_COST_UNKNOWN'));
  assert.equal(calls.some(row => row.id === 'unknown'), false);
});

test('contradictory declared stances are exposed and never converted into consensus', async () => {
  const calls = [];
  const pool = new ProviderPool([
    provider({ id: 'a1', providerId: 'alpha', modelId: 'm1', calls, stance: 'APPROVE' }),
    provider({ id: 'b1', providerId: 'beta', modelId: 'm2', calls, stance: 'REJECT' }),
  ]);

  const result = await runModelCouncil({ pool, request: 'contradiction' });

  assert.equal(result.consensus.status, 'CONTRADICTORY');
  assert.equal(result.consensus.inferred_consensus, false);
  assert.deepEqual(result.consensus.declared_stances, ['approve', 'reject']);
  assert.equal(result.synthesis.status, 'COMPLETE');
});

test('canonical provenance cannot be spoofed by provider-reported provenance', async () => {
  const calls = [];
  const pool = new ProviderPool([
    provider({
      id: 'a1',
      providerId: 'alpha',
      modelId: 'm1',
      calls,
      reportedProvenance: { provider: 'spoofed', model: 'spoofed-model', token: 'must-not-be-promoted' },
    }),
  ]);

  const result = await runModelCouncil({ pool, request: 'provenance' });
  const critique = result.critiques[0];

  assert.equal(critique.provenance.provider, 'alpha');
  assert.equal(critique.provenance.model, 'm1');
  assert.equal(critique.provenance.reported.provider, 'spoofed');
  assert.equal(Object.hasOwn(critique.provenance.reported, 'token'), false);
  assert.equal(result.audit.some(row => Object.hasOwn(row, 'token')), false);
});

test('variable completion order yields deterministic critique ordering', async () => {
  const calls = [];
  const pool = new ProviderPool([
    provider({ id: 'z', providerId: 'zeta', modelId: 'm9', calls, delayMs: 15 }),
    provider({ id: 'a', providerId: 'alpha', modelId: 'm1', calls, delayMs: 1 }),
    provider({ id: 'm', providerId: 'mu', modelId: 'm5', calls, delayMs: 5 }),
  ]);

  const result = await runModelCouncil({ pool, request: 'order' });

  assert.deepEqual(result.critiques.map(row => row.identity), ['alpha::m1', 'mu::m5', 'zeta::m9']);
});

test('benchmark metadata is comparable only across the same benchmark suite', async () => {
  const calls = [];
  const pool = new ProviderPool([
    provider({ id: 'a', providerId: 'alpha', modelId: 'm1', calls }),
    provider({ id: 'b', providerId: 'beta', modelId: 'm2', calls }),
  ]);
  const benchmarks = {
    'alpha::m1': { overall: 0.8, suite_id: 'mel-learning-canonical-v1', suite_digest: 'digest-1', source: 'ci' },
    'beta::m2': { overall: 0.6, suite_id: 'mel-learning-canonical-v1', suite_digest: 'digest-1', source: 'ci' },
  };

  const result = await runModelCouncil({ pool, request: 'benchmark', benchmarks });

  assert.equal(result.benchmark_comparison.comparable, true);
  assert.deepEqual(result.benchmark_comparison.models.map(row => row.overall), [0.8, 0.6]);
});


test('missing benchmark score is ignored and unidentified suites are not compared', async () => {
  const calls = [];
  const pool = new ProviderPool([
    provider({ id: 'a', providerId: 'alpha', modelId: 'm1', calls, benchmark: { suite_id: 'suite-without-score' } }),
    provider({ id: 'b', providerId: 'beta', modelId: 'm2', calls }),
  ]);
  const benchmarks = {
    'beta::m2': { overall: 0.7 },
    'alpha::m1': { overall: 0.8 },
  };

  const result = await runModelCouncil({ pool, request: 'benchmark identity', benchmarks });

  assert.equal(result.critiques.find(row => row.identity === 'alpha::m1').benchmark.overall, 0.8);
  assert.equal(result.benchmark_comparison.comparable, false);

  const onlyMissing = await runModelCouncil({
    pool: new ProviderPool([
      provider({ id: 'c', providerId: 'gamma', modelId: 'm3', calls, benchmark: { suite_id: 'suite-without-score' } }),
    ]),
    request: 'missing score',
  });
  assert.equal(onlyMissing.critiques[0].benchmark, null);
});

test('no available provider fails closed with a deterministic structured error', async () => {
  const calls = [];
  const pool = new ProviderPool([
    provider({ id: 'down', providerId: 'down-provider', modelId: 'm1', calls, healthStatus: 'UNAVAILABLE' }),
  ]);

  await assert.rejects(
    () => runModelCouncil({ pool, request: 'none available' }),
    error => error.code === 'COUNCIL_NO_ELIGIBLE_PROVIDER'
      && Array.isArray(error.rejections)
      && Array.isArray(error.failures)
  );
});

test('all eligible providers failing critiques produces no synthetic answer', async () => {
  const calls = [];
  const pool = new ProviderPool([
    provider({ id: 'a', providerId: 'alpha', modelId: 'm1', calls, failCritique: true }),
    provider({ id: 'b', providerId: 'beta', modelId: 'm2', calls, failCritique: true }),
  ]);

  await assert.rejects(
    () => runModelCouncil({ pool, request: 'all fail' }),
    error => error.code === 'COUNCIL_ALL_PROVIDERS_FAILED'
      && error.failures.length === 2
  );
});
