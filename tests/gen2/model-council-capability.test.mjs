import test from 'node:test';
import assert from 'node:assert/strict';

import worker from '../../src/index.js';
import { createGen2Runtime } from '../../src/core/orchestrator/gen2-runtime.js';

process.env.MEL_TEST_VERIFIED_ZERO_COST_PROVIDERS = '1';

function runtimeEnv(calls = []) {
  return {
    MELITURGOS_USER: 'adrien',
    MELITURGOS_PASSWORD: 'test',
    AI: {
      run: async (model, payload) => {
        calls.push({ model, payload });
        return {
          response: `runtime-response-${model}-${calls.length}`,
          provenance: { provider: 'workers-ai', model },
        };
      },
    },
  };
}

function context() {
  return {
    owner: 'adrien',
    permissions: [],
    requestId: 'gen2-05-runtime-test',
  };
}

test('CapabilityBus registers and executes the canonical provider-neutral Model Council', async () => {
  const calls = [];
  const runtime = createGen2Runtime({ env: runtimeEnv(calls) });
  const manifest = runtime.bus.list().find(row => row.id === 'model-council.run');

  assert.ok(manifest);
  assert.equal(manifest.category, 'orchestration');

  const result = await runtime.bus.execute('model-council.run', {
    request: { prompt: 'Compare two approaches without inventing consensus.' },
    capability: 'GENERAL',
    maxCandidates: 2,
    timeoutMs: 1000,
  }, context());

  assert.equal(result.schema, 'mel.model-council');
  assert.equal(result.status, 'COMPLETE');
  assert.equal(result.independent_response_count, 2);
  assert.equal(result.unique_model_count, 2);
  assert.equal(result.synthesis.status, 'COMPLETE');
  assert.equal(result.consensus.inferred_consensus, false);
  assert.equal(calls.length, 3);
  assert.equal(new Set(result.critiques.map(row => row.provenance.model)).size, 2);
  assert.ok(result.critiques.every(row => row.provenance.provider === 'workers-ai'));
});

test('default runtime Council makes zero provider calls without verified zero-cost provenance', async () => {
  const previous = process.env.MEL_TEST_VERIFIED_ZERO_COST_PROVIDERS;
  delete process.env.MEL_TEST_VERIFIED_ZERO_COST_PROVIDERS;
  const calls = [];
  try {
    const runtime = createGen2Runtime({ env: runtimeEnv(calls) });
    await assert.rejects(
      () => runtime.bus.execute('model-council.run', {
        request: { prompt: 'This must remain fail-closed.' },
        capability: 'GENERAL',
        maxCandidates: 2,
        timeoutMs: 1000,
      }, context()),
      error => error.code === 'COUNCIL_NO_ELIGIBLE_PROVIDER'
        && Array.isArray(error.rejections)
        && error.rejections.length >= 1,
    );
    assert.equal(calls.length, 0);
  } finally {
    if (previous === undefined) process.env.MEL_TEST_VERIFIED_ZERO_COST_PROVIDERS = '1';
    else process.env.MEL_TEST_VERIFIED_ZERO_COST_PROVIDERS = previous;
  }
});

test('CapabilityBus Model Council rejects an empty structured request', async () => {
  const runtime = createGen2Runtime({ env: runtimeEnv() });

  await assert.rejects(
    () => runtime.bus.execute('model-council.run', {
      request: {},
      capability: 'GENERAL',
      maxCandidates: 2,
      timeoutMs: 1000,
    }, context()),
    error => error.code === 'COUNCIL_REQUEST_REQUIRED' && error.status === 400,
  );
});

test('authenticated /api/gen2/model-council executes through CapabilityBus', async () => {
  const calls = [];
  const env = runtimeEnv(calls);
  const auth = 'Basic ' + Buffer.from('adrien:test').toString('base64');
  const response = await worker.fetch(new Request('https://mel.test/api/gen2/model-council', {
    method: 'POST',
    headers: {
      authorization: auth,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      request: { prompt: 'Produce independent critiques then synthesize.' },
      maxCandidates: 2,
      timeoutMs: 1000,
    }),
  }), env, {});

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.schema, 'mel.model-council');
  assert.equal(body.independent_response_count, 2);
  assert.equal(body.synthesis.status, 'COMPLETE');
  assert.equal(calls.length, 3);
});

test('/api/gen2/model-council rejects missing request instead of calling a provider', async () => {
  const calls = [];
  const env = runtimeEnv(calls);
  const auth = 'Basic ' + Buffer.from('adrien:test').toString('base64');
  const response = await worker.fetch(new Request('https://mel.test/api/gen2/model-council', {
    method: 'POST',
    headers: {
      authorization: auth,
      'content-type': 'application/json',
    },
    body: JSON.stringify({}),
  }), env, {});

  assert.equal(response.status, 400);
  const body = await response.json();
  assert.equal(body.ok, false);
  assert.equal(body.code, 'COUNCIL_REQUEST_REQUIRED');
  assert.equal(calls.length, 0);
});

test('/api/gen2/model-council remains authenticated', async () => {
  const response = await worker.fetch(new Request('https://mel.test/api/gen2/model-council', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ request: { prompt: 'x' } }),
  }), runtimeEnv(), {});

  assert.equal(response.status, 401);
});
