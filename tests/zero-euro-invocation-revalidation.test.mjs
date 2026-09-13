import test from 'node:test';
import assert from 'node:assert/strict';
import { ProviderPool } from '../src/augmentio/provider-pool.js';
import { Augmentio } from '../src/augmentio/augmentio.js';
import { ZERO_EURO_POLICY } from '../src/augmentio/zero-euro-governor.js';
import { runAugmentioStateOfPlay } from '../src/teachers/augmentio-council.js';

function verifiedFree(id, { provider = '', model = '' } = {}) {
  const authorization = {
    approved: true,
    policy: ZERO_EURO_POLICY,
    authority: 'zero-euro-invocation-revalidation-test',
    adapter_id: id,
  };
  if (provider) authorization.provider = provider;
  if (model) authorization.model = model;
  return {
    verified: true,
    addedCost: 0,
    source: 'test-fixture-no-external-billing',
    authorization,
  };
}

test('Augmentio blocks a provider that becomes paid after selection but before invocation', async () => {
  let externalCalls = 0;
  const provider = {
    id: 'mutable',
    capabilities: ['GENERAL'],
    priority: 1,
    estimatedCost: 0,
    costProvenance: verifiedFree('mutable'),
    enabled: true,
    healthStatus: 'HEALTHY',
    invoke: async () => {
      externalCalls += 1;
      return { text: 'must never be called' };
    },
  };
  const pool = new ProviderPool([provider]);
  const scheduler = {
    async run(tasks, worker) {
      tasks[0].estimatedCost = 1;
      return Promise.allSettled(tasks.map((task, index) => worker(task, index, {})));
    },
  };
  const augmentio = new Augmentio({ pool, scheduler });

  await assert.rejects(
    () => augmentio.fanOut({ input: 'prove fail-closed invocation revalidation' }),
    (error) => error?.code === 'ALL_PROVIDERS_FAILED'
      && Array.isArray(error.failures)
      && error.failures.some((row) => row.includes('ZERO_EURO_BUDGET_EXCEEDED')),
  );
  assert.equal(externalCalls, 0);
});

test('Council revalidates each provider at invocation time and falls back without calling one that became paid', async () => {
  const externalCalls = [];
  const a = {
    id: 'a',
    providerId: 'test',
    modelId: 'a',
    capabilities: ['GENERAL'],
    priority: 2,
    estimatedCost: 0,
    costProvenance: verifiedFree('a', { provider: 'test', model: 'a' }),
    enabled: true,
    healthStatus: 'HEALTHY',
    invoke: async ({ context = {} }) => {
      externalCalls.push({ id: 'a', purpose: context.purpose || '', role: context.council_role || '' });
      return { text: `safe response ${context.council_role || context.purpose || ''}`, provenance: { provider: 'test', model: 'a' } };
    },
  };

  let bCostReads = 0;
  const b = {
    id: 'b',
    providerId: 'test',
    modelId: 'b',
    capabilities: ['GENERAL'],
    priority: 1,
    get estimatedCost() {
      bCostReads += 1;
      return bCostReads === 1 ? 0 : 1;
    },
    costProvenance: verifiedFree('b', { provider: 'test', model: 'b' }),
    enabled: true,
    healthStatus: 'HEALTHY',
    invoke: async ({ context = {} }) => {
      externalCalls.push({ id: 'b', purpose: context.purpose || '', role: context.council_role || '' });
      return { text: 'must never be called', provenance: { provider: 'test', model: 'b' } };
    },
  };

  const pool = {
    async refreshHealth() {},
    list() { return [a, b]; },
  };

  const report = await runAugmentioStateOfPlay({ env: {}, goal: 'prove Council zero-euro TOCTOU closure', pool, minResponses: 2 });
  assert.equal(report.status, 'COMPLETE');
  assert.equal(report.synthesis.provider_id, 'a');
  assert.equal(externalCalls.some((row) => row.id === 'b'), false, 'provider b must fail authorization before external invocation');
  const security = report.responses.find((row) => row.answer?.role === 'SECURITY_GOVERNANCE');
  assert.ok(security);
  assert.equal(security.answer.assigned_provider_id, 'b');
  assert.equal(security.answer.provider_id, 'a');
  assert.equal(security.answer.provider_fallback_used, true);
  assert.deepEqual(security.answer.provider_attempts, ['b', 'a']);
});
