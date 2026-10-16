import test from 'node:test';
import assert from 'node:assert/strict';
import { ProviderPool } from '../../src/augmentio/provider-pool.js';
import { ZERO_EURO_POLICY } from '../../src/augmentio/zero-euro-governor.js';
import { runModelCouncil, MAX_COUNCIL_CRITIQUE_CHARS, MAX_COUNCIL_SYNTHESIS_CHARS } from '../../src/models/model-council.js';
import { standardRegistry } from '../../src/models/ModelRegistry.js';
import { createDefaultCapabilityBus } from '../../src/capabilities/default-bus.js';
import router from '../../src/router.js';

process.env.MEL_TEST_VERIFIED_ZERO_COST_PROVIDERS = '1';

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
  assert.equal(calls.filter(row => row.payload.max_tokens === 384).length, 2);
  assert.equal(calls.filter(row => row.payload.max_tokens === 512).length, 1);
  assert.ok(calls.every(row => Number(row.payload.max_tokens || 0) <= 512));
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

test('a failed MEL synthesis reports bounded failure codes without leaking provider exception messages', async () => {
  const calls = [];
  const pool = new ProviderPool([
    provider({ id: 'a', providerId: 'alpha', modelId: 'm1', calls, failSynthesis: true }),
    provider({ id: 'b', providerId: 'beta', modelId: 'm2', calls, failSynthesis: true }),
  ]);
  await assert.rejects(
    () => runModelCouncil({ pool, request: 'redacted synthesis diagnostics' }),
    error => error.code === 'COUNCIL_SYNTHESIS_FAILED'
      && error.status === 503
      && error.diagnostic_codes?.length === 2
      && error.diagnostic_codes.every(code => code === 'SYNTHESIS_FAILED')
      && !JSON.stringify(error.diagnostic_codes).includes('redacted synthesis diagnostics')
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


test('transient provider critique failure is retried once without reducing Council independence', async () => {
  const calls = [];
  let flakyAttempts = 0;
  const flaky = {
    id:'flaky',
    providerId:'alpha',
    modelId:'m1',
    capabilities:['GENERAL'],
    priority:1,
    estimatedCost:0,
    costProvenance:verifiedFree({id:'flaky',providerId:'alpha',modelId:'m1'}),
    enabled:true,
    healthStatus:'HEALTHY',
    health:async()=> 'HEALTHY',
    async invoke({context={}}={}) {
      calls.push({id:'flaky',purpose:context.purpose});
      if (context.purpose === 'model-council-independent-critique') {
        flakyAttempts += 1;
        if (flakyAttempts === 1) throw Object.assign(new Error('TRANSIENT_PROVIDER_FAILURE'), {code:'TRANSIENT_PROVIDER_FAILURE'});
        return {text:'recovered critique',provenance:{provider:'alpha',model:'m1'}};
      }
      return {text:'synthesis',provenance:{provider:'alpha',model:'m1'}};
    },
  };
  const stable = provider({id:'stable',providerId:'beta',modelId:'m2',calls});
  const result = await runModelCouncil({
    pool:new ProviderPool([flaky,stable]),
    request:'bounded retry',
    timeoutMs:5000,
  });

  assert.equal(result.status,'COMPLETE');
  assert.equal(result.independent_response_count,2);
  assert.equal(new Set(result.critiques.map(row=>row.identity)).size,2);
  assert.equal(flakyAttempts,2);
  assert.equal(result.provider_failure_count,0);
});


test('production Council registry exposes the current four-model Workers AI pool and excludes paid Kimi', () => {
  const models = standardRegistry.list();
  const ids = new Set(models.map(row => row.id));
  assert.ok(ids.has('@cf/meta/llama-3.3-70b-instruct-fp8-fast'));
  assert.ok(ids.has('@cf/google/gemma-4-26b-a4b-it'));
  assert.ok(ids.has('@cf/nvidia/nemotron-3-120b-a12b'));
  assert.ok(ids.has('@cf/zai-org/glm-4.7-flash'));
  assert.equal(ids.has('@cf/moonshotai/kimi-k2.7-code'), false);
  for (const id of [
    '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
    '@cf/google/gemma-4-26b-a4b-it',
    '@cf/nvidia/nemotron-3-120b-a12b',
    '@cf/zai-org/glm-4.7-flash',
  ]) {
    const model = models.find(row => row.id === id);
    assert.equal(model?.enabled, true);
    assert.ok((model?.capabilities || []).includes('GENERAL'));
  }
});

test('Council audit never contains an arbitrary provider exception message', async () => {
  const calls = [];
  const failed = provider({ id: 'unsafe-err', providerId: 'alpha', modelId: 'm1', calls });
  failed.invoke = async () => {
    throw new Error('Provider rejected request with PRIVATE_TOKEN_XYZ and user prompt');
  };
  const healthy = provider({ id: 'healthy', providerId: 'beta', modelId: 'm2', calls });
  const result = await runModelCouncil({
    pool: new ProviderPool([failed, healthy]),
    request: { prompt: 'do not expose my secrets' },
  });
  assert.equal(result.status, 'DEGRADED_SINGLE_MODEL');
  assert.equal(result.failures.length, 1);
  assert.equal(result.failures[0].code, 'PROVIDER_FAILED');
  assert.doesNotMatch(JSON.stringify(result.failures), /PRIVATE_TOKEN_XYZ|user prompt/);
});

test('Council preserves known bounded machine codes and rejects unbounded provider codes', async () => {
  const calls = [];
  const bad = provider({ id: 'unsafe-code', providerId: 'alpha', modelId: 'm1', calls });
  bad.invoke = async () => {
    throw Object.assign(new Error('private request text'), {code: 'PRIVATE CODE: private request text'});
  };
  const healthy = provider({ id: 'healthy', providerId: 'beta', modelId: 'm2', calls });
  const result = await runModelCouncil({
    pool: new ProviderPool([bad, healthy]),
    request: 'privacy code test',
  });
  assert.deepEqual(result.failures.map(row => row.code), ['PROVIDER_FAILED']);
  assert.doesNotMatch(JSON.stringify(result.failures), /private request text/);
});

test('Council rejects critique when a model loses zero-cost authorization during generation', async () => {
  const calls = [];
  const trusted = provider({ id: 'a', providerId: 'alpha', modelId: 'm1', calls });
  const revoked = provider({ id: 'b', providerId: 'beta', modelId: 'm2', calls });
  const fallback = provider({ id: 'c', providerId: 'gamma', modelId: 'm3', calls });
  const originalInvoke = revoked.invoke.bind(revoked);
  revoked.invoke = async (input) => {
    const reply = await originalInvoke(input);
    if (input.context?.purpose === 'model-council-independent-critique') {
      revoked.estimatedCost = 10;
    }
    return reply;
  };
  const result = await runModelCouncil({
    pool: new ProviderPool([trusted, revoked, fallback]),
    request: { prompt: 'prove live zero-euro Council' },
    maxCandidates: 3,
  });
  assert.equal(result.status, 'COMPLETE');
  assert.deepEqual(result.critiques.map(row => row.identity), ['alpha::m1', 'gamma::m3']);
  assert.equal(result.independent_response_count, 2);
  assert.ok(result.failures.some(row => row.identity === 'beta::m2'));
  assert.equal(result.synthesis.status, 'COMPLETE');
  assert.equal(result.critiques.some(row => row.cost.estimated_cost !== 0), false);
});

test('Council rejects a model whose identity mutates while producing a critique', async () => {
  const calls = [];
  const trusted = provider({ id: 'trusted', providerId: 'alpha', modelId: 'model-a', calls });
  const switched = provider({ id: 'mutable', providerId: 'beta', modelId: 'original', calls });
  const originalInvoke = switched.invoke.bind(switched);
  switched.invoke = async (input) => {
    const result = await originalInvoke(input);
    if (input.context?.purpose === 'model-council-independent-critique') {
      switched.modelId = 'replacement';
    }
    return result;
  };
  const result = await runModelCouncil({
    pool: new ProviderPool([trusted, switched]), request: 'identity binding',
  });
  assert.equal(result.status, 'DEGRADED_SINGLE_MODEL');
  assert.deepEqual(result.critiques.map(row => row.identity), ['alpha::model-a']);
  assert.ok(result.failures.some(row => row.code === 'COUNCIL_PROVIDER_IDENTITY_CHANGED'));
});

test('Council synthesis revalidates zero-cost approval and safely fails over', async () => {
  const calls = [];
  const first = provider({ id: 'a', providerId: 'alpha', modelId: 'm1', calls });
  const second = provider({ id: 'b', providerId: 'beta', modelId: 'm2', calls });
  const originalInvoke = first.invoke.bind(first);
  first.invoke = async (input) => {
    const result = await originalInvoke(input);
    if (input.context?.purpose === 'model-council-synthesis') {
      first.costProvenance = null;
    }
    return result;
  };
  const result = await runModelCouncil({
    pool: new ProviderPool([first, second]), request: 'synthesis approval',
  });
  assert.equal(result.status, 'COMPLETE');
  assert.equal(result.independent_response_count, 2);
  assert.equal(result.synthesis.status, 'COMPLETE');
  assert.equal(result.synthesis.provenance.provider, 'beta');
  assert.deepEqual(result.synthesis.attempted, ['alpha::m1', 'beta::m2']);
  assert.equal(result.synthesis.cost.allowed, true);
});

test('Council synthesis uses each healthy critic at most once before falling back', async () => {
  const calls = [];
  const pool = new ProviderPool([
    provider({ id: 'first', providerId: 'alpha', modelId: 'model-a', calls, failSynthesis: true }),
    provider({ id: 'next', providerId: 'beta', modelId: 'model-b', calls }),
  ]);
  const result = await runModelCouncil({
    pool, request: 'test fast synthesis fallback', timeoutMs: 50,
  });
  assert.equal(result.status, 'COMPLETE');
  assert.equal(result.independent_response_count, 2);
  assert.equal(result.synthesis.status, 'COMPLETE');
  assert.equal(result.synthesis.provenance.provider, 'beta');
  assert.deepEqual(result.synthesis.attempted, ['alpha::model-a', 'beta::model-b']);
  const synthesisCalls = calls.filter(row => row.purpose === 'model-council-synthesis');
  assert.deepEqual(synthesisCalls.map(row => row.id), ['first', 'next'],
    'bad synthesizer is not needlessly retried before a healthy peer');
});

test('a failed Council synthesis makes one bounded attempt per verified model', async () => {
  const calls = [];
  const pool = new ProviderPool([
    provider({ id: 'a', providerId: 'alpha', modelId: 'model-a', calls, failSynthesis: true }),
    provider({ id: 'b', providerId: 'beta', modelId: 'model-b', calls, failSynthesis: true }),
  ]);
  await assert.rejects(
    runModelCouncil({ pool, request: 'all synthesis providers fail', timeoutMs: 50 }),
    error => error?.code === 'COUNCIL_SYNTHESIS_FAILED'
      && error?.diagnostic_codes?.length === 2,
  );
  assert.deepEqual(calls.filter(row => row.purpose === 'model-council-synthesis')
    .map(row => row.id), ['a', 'b']);
});

test('Council rejects hung external health refresh before invoking any AI model', async () => {
  let listCalls = 0;
  const pool = {
    async refreshHealth() { return new Promise(() => {}); },
    list() { listCalls += 1; return []; },
  };
  const started = Date.now();
  await assert.rejects(runModelCouncil({
    pool, request: 'prove the Council health deadline', timeoutMs: 25,
  }), error => error?.code === 'COUNCIL_HEALTH_REFRESH_TIMEOUT' && error?.status === 504);
  assert.ok(Date.now() - started < 1500, 'hanging health probes must not block Council');
  assert.equal(listCalls, 0, 'no model is selected without a verified health refresh');
});

test('Council cancels a hung health refresh promptly on owner request', async () => {
  let listCalls = 0;
  const controller = new AbortController();
  const pool = {
    async refreshHealth() { return new Promise(() => {}); },
    list() { listCalls += 1; return []; },
  };
  const started = Date.now();
  const pending = runModelCouncil({
    pool, request: 'cancel Council before any provider is used',
    timeoutMs: 30000, signal: controller.signal,
  });
  setTimeout(() => controller.abort('owner-cancelled'), 15);
  await assert.rejects(pending, error => error?.code === 'SCHEDULER_ABORTED');
  assert.ok(Date.now() - started < 1500);
  assert.equal(listCalls, 0);
});

test('Council rejects an already-cancelled call without invoking a pool probe', async () => {
  let healthCalls = 0;
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(runModelCouncil({
    pool: {
      async refreshHealth() { healthCalls += 1; },
      list() { return []; },
    },
    request: 'already cancelled',
    signal: controller.signal,
  }), error => error?.code === 'SCHEDULER_ABORTED');
  assert.equal(healthCalls, 0);
});

test('Council returns owner cancellation rather than synthesis failure when synthesis hangs', async () => {
  const controller = new AbortController();
  let startedSynthesis;
  let synthCalls = 0;
  const started = new Promise(resolve => { startedSynthesis = resolve; });
  const adapters = ['model-a', 'model-b'].map((id, index) => ({
    id,
    providerId: 'workers-ai',
    modelId: id,
    capabilities: ['GENERAL'],
    priority: 2 - index,
    estimatedCost: 0,
    costProvenance: verifiedFree({ id, providerId: 'workers-ai', modelId: id }),
    enabled: true,
    healthStatus: 'HEALTHY',
    async invoke({ context }) {
      if (context.purpose === 'model-council-independent-critique') {
        return { text: 'independent critique from ' + id };
      }
      synthCalls += 1;
      startedSynthesis();
      return new Promise(() => {}); // Deliberately ignores AbortSignal.
    },
  }));
  const council = runModelCouncil({
    pool: new ProviderPool(adapters),
    request: 'cancel after completed critiques',
    timeoutMs: 30_000,
    signal: controller.signal,
  });
  await started;
  const began = Date.now();
  controller.abort('owner-stopped');
  await assert.rejects(council, error => error?.code === 'SCHEDULER_ABORTED');
  assert.ok(Date.now() - began < 2000, 'owner cancellation must be prompt');
  assert.equal(synthCalls, 1, 'no extra synthesis provider after owner cancel');
});

test('Council does not report a degraded or all-failed result after owner cancels critiques', async () => {
  const controller = new AbortController();
  let startedCritique;
  let critiqueCalls = 0;
  let synthesisCalls = 0;
  const started = new Promise(resolve => { startedCritique = resolve; });
  const adapter = {
    id: 'blocked', providerId: 'workers-ai', modelId: 'blocked',
    priority: 1, capabilities: ['GENERAL'], estimatedCost: 0,
    costProvenance: verifiedFree({id:'blocked',providerId:'workers-ai',modelId:'blocked'}),
    enabled: true, healthStatus: 'HEALTHY',
    async invoke({ context }) {
      if (context.purpose === 'model-council-synthesis') {
        synthesisCalls += 1;
        return { text: 'not allowed after cancellation' };
      }
      critiqueCalls += 1;
      startedCritique();
      return new Promise(() => {});
    },
  };
  const request = runModelCouncil({
    pool: new ProviderPool([adapter]), request: 'cancel before critique completes',
    timeoutMs: 30_000, signal: controller.signal,
  });
  await started;
  controller.abort('owner-stopped');
  await assert.rejects(request, error => error?.code === 'SCHEDULER_ABORTED');
  assert.equal(critiqueCalls, 1);
  assert.equal(synthesisCalls, 0);
});

test('Council rejects excessive critique text and retains independent healthy alternatives', async () => {
  const calls = [];
  const oversized = provider({ id: 'bad', providerId: 'alpha', modelId: 'huge', calls });
  const normal = provider({ id: 'good-a', providerId: 'beta', modelId: 'normal', calls });
  const other = provider({ id: 'good-b', providerId: 'gamma', modelId: 'normal', calls });
  const original = oversized.invoke;
  oversized.invoke = async (args) => {
    if (args.context?.purpose === 'model-council-independent-critique') {
      calls.push({ id: 'bad', purpose: 'model-council-independent-critique' });
      return { text: 'X'.repeat(MAX_COUNCIL_CRITIQUE_CHARS + 1) };
    }
    return original(args);
  };
  const result = await runModelCouncil({
    pool: new ProviderPool([oversized, normal, other]),
    request: 'bounded Council evidence', timeoutMs: 2500,
  });
  assert.equal(result.status, 'COMPLETE');
  assert.equal(result.critiques.length, 2);
  assert.equal(result.provider_failure_count, 1);
  assert.equal(result.failures[0].code, 'AI_PROVIDER_RESPONSE_TOO_LARGE');
  assert.equal(result.synthesis.status, 'COMPLETE');
  assert.ok(result.critiques.every(row => row.text.length <= MAX_COUNCIL_CRITIQUE_CHARS));
});

test('Council fails closed if all independent critiques exceed the size ceiling', async () => {
  const calls = [];
  const adapters = ['a', 'b'].map(id => {
    const a = provider({ id, providerId: id, modelId: 'huge', calls });
    a.invoke = async () => {
      calls.push(id);
      return { text: 'x'.repeat(MAX_COUNCIL_CRITIQUE_CHARS + 1) };
    };
    return a;
  });
  await assert.rejects(runModelCouncil({
    pool: new ProviderPool(adapters), request: 'reject huge evidence',
    timeoutMs: 2500,
  }), error => error?.code === 'COUNCIL_ALL_PROVIDERS_FAILED'
    && error.failures?.length === 2
    && error.failures.every(row => row.code === 'AI_PROVIDER_RESPONSE_TOO_LARGE'));
  assert.equal(calls.length, 2, 'oversized responses are not retried');
});

test('Council falls back if the first synthesis response exceeds its size ceiling', async () => {
  const calls = [];
  const first = provider({ id: 'a', providerId: 'alpha', modelId: 'one', calls });
  const second = provider({ id: 'b', providerId: 'beta', modelId: 'two', calls });
  const original = first.invoke;
  first.invoke = async (args) => {
    if (args.context?.purpose === 'model-council-synthesis') {
      calls.push({ id: 'a', purpose: 'model-council-synthesis' });
      return { text: 'x'.repeat(MAX_COUNCIL_SYNTHESIS_CHARS + 1) };
    }
    return original(args);
  };
  const result = await runModelCouncil({
    pool: new ProviderPool([first, second]),
    request: 'synthesis must remain bounded',
    timeoutMs: 2500,
  });
  assert.equal(result.status, 'COMPLETE');
  assert.equal(result.synthesis.status, 'COMPLETE');
  assert.deepEqual(result.synthesis.attempted, ['alpha::one', 'beta::two']);
  assert.ok(result.synthesis.text.length <= MAX_COUNCIL_SYNTHESIS_CHARS);
  assert.equal(calls.filter(row => row.purpose === 'model-council-synthesis').length, 2);
});
