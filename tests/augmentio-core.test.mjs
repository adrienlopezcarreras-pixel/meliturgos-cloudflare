import test from 'node:test';
import assert from 'node:assert/strict';
import { ProviderPool } from '../src/augmentio/provider-pool.js';
import { ZeroEuroGovernor, ZERO_EURO_POLICY } from '../src/augmentio/zero-euro-governor.js';
import { ParallelScheduler } from '../src/augmentio/parallel-scheduler.js';
import { ResultTournament } from '../src/augmentio/result-tournament.js';
import { Augmentio } from '../src/augmentio/augmentio.js';

function verifiedFree(id, { provider = '', model = '', authority = 'augmentio-test-suite' } = {}) {
  const authorization = {
    approved: true,
    policy: ZERO_EURO_POLICY,
    authority,
    adapter_id: id,
  };
  if (provider) authorization.provider = provider;
  if (model) authorization.model = model;
  return Object.freeze({
    verified: true,
    addedCost: 0,
    source: 'test-fixture-no-external-billing',
    authorization: Object.freeze(authorization),
  });
}

test('zero euro governor blocks paid, unknown-cost, unverified, unauthorized, and identity-mismatched routes', () => {
  const governor = new ZeroEuroGovernor();
  const direct = verifiedFree('direct');
  assert.equal(governor.allows({ id: 'direct', estimatedCost: 0, costProvenance: direct }), true);
  assert.equal(governor.allows({ id: 'direct', cost: 0, costProvenance: direct }), true);
  assert.equal(governor.allows({ id: 'direct', estimatedCost: '0', costProvenance: direct }), true);
  assert.equal(governor.allows({ id: 'direct', estimatedCost: '0.00', costProvenance: direct }), true);
  assert.equal(governor.allows({ id: 'direct', estimatedCost: 0 }), false, 'numeric zero alone is not cost proof');
  assert.equal(governor.allows({ id: 'direct', estimatedCost: 0, costProvenance: { verified: false, addedCost: 0, source: 'test', authorization: direct.authorization } }), false);
  assert.equal(governor.allows({ id: 'direct', estimatedCost: 0, costProvenance: { verified: true, addedCost: 0 } }), false);
  assert.equal(governor.allows({ id: 'direct', estimatedCost: 0, costProvenance: { verified: true, addedCost: 1, source: 'test', authorization: direct.authorization } }), false);
  assert.equal(governor.allows({ id: 'direct', estimatedCost: 0, costProvenance: { verified: true, addedCost: 0, source: 'self-claim' } }), false, 'verified is not the same as locally authorized');
  assert.equal(governor.allows({ id: 'other', estimatedCost: 0, costProvenance: direct }), false, 'authorization cannot be replayed to another adapter');
  assert.equal(governor.allows({ id: 'direct', providerId: 'p', modelId: 'm', estimatedCost: 0, costProvenance: direct }), false, 'provider/model identity must also be bound when present');
  assert.equal(governor.allows({ id: 'bound', providerId: 'p', modelId: 'm', estimatedCost: 0, costProvenance: verifiedFree('bound', { provider: 'p', model: 'm' }) }), true);
  assert.equal(governor.allows({ id: 'direct', estimatedCost: 0.01, costProvenance: direct }), false);
  assert.equal(governor.allows({ id: 'direct', estimatedCost: null, costProvenance: direct }), false);
  assert.equal(governor.allows({ id: 'direct', cost: null, costProvenance: direct }), false);
  assert.equal(governor.allows({}), false);
  assert.equal(governor.allows({ id: 'direct', estimatedCost: Number.NaN, costProvenance: direct }), false);
  assert.equal(governor.allows({ id: 'direct', estimatedCost: '', costProvenance: direct }), false);
  assert.equal(governor.allows({ id: 'direct', estimatedCost: '   ', costProvenance: direct }), false);
  assert.equal(governor.allows({ id: 'direct', estimatedCost: false, costProvenance: direct }), false);
  assert.equal(governor.allows({ id: 'direct', estimatedCost: true, costProvenance: direct }), false);
  assert.equal(governor.allows({ id: 'direct', estimatedCost: {}, costProvenance: direct }), false);
  assert.equal(governor.allows({ id: 'direct', estimatedCost: [], costProvenance: direct }), false);

  assert.equal(governor.evaluate({ id: 'direct', estimatedCost: 0, costProvenance: { verified: true, addedCost: 0, source: 'self-claim' } }).code, 'ZERO_EURO_AUTHORIZATION_REQUIRED');
  assert.equal(governor.evaluate({ id: 'direct', costProvenance: direct }).code, 'ZERO_EURO_COST_UNKNOWN');
  assert.throws(
    () => governor.assertAllowed({ id: 'direct', estimatedCost: 0, costProvenance: { verified: true, addedCost: 0, source: 'self-claim' } }),
    error => error?.code === 'ZERO_EURO_AUTHORIZATION_REQUIRED',
  );

  const attemptedWidening = new ZeroEuroGovernor({ maxCost: 10 });
  assert.equal(attemptedWidening.maxCost, 0);
  assert.equal(attemptedWidening.allows({ id: 'direct', estimatedCost: 0.01, costProvenance: direct }), false);
});

test('provider pool filters by capability and health', () => {
  const pool = new ProviderPool([
    { id: 'a', capabilities: ['GENERAL'], priority: 1, invoke: async () => 'a' },
    { id: 'b', capabilities: ['CODE'], priority: 2, invoke: async () => 'b' },
    { id: 'c', capabilities: ['GENERAL'], health: 'UNAVAILABLE', invoke: async () => 'c' },
  ]);
  assert.deepEqual(pool.list({ capability: 'GENERAL' }).map((p) => p.id), ['a']);
});

test('parallel scheduler executes independent work concurrently', async () => {
  const scheduler = new ParallelScheduler({ globalConcurrency: 3 });
  const started = Date.now();
  const settled = await scheduler.run([80, 80, 80], async (delay) => {
    await new Promise((resolve) => setTimeout(resolve, delay));
    return delay;
  });
  assert.equal(settled.filter((x) => x.status === 'fulfilled').length, 3);
  assert.ok(Date.now() - started < 220, 'expected parallel execution');
});

test('parallel scheduler enforces per-provider concurrency', async () => {
  const scheduler = new ParallelScheduler({ globalConcurrency: 6, perProviderConcurrency: 2, timeoutMs: 1000 });
  let active = 0;
  let maxActive = 0;
  const tasks = Array.from({ length: 6 }, (_, i) => ({ providerId: 'same-provider', i }));
  const settled = await scheduler.run(tasks, async () => {
    active += 1;
    maxActive = Math.max(maxActive, active);
    await new Promise((resolve) => setTimeout(resolve, 20));
    active -= 1;
    return true;
  });
  assert.equal(settled.every((x) => x.status === 'fulfilled'), true);
  assert.equal(maxActive, 2);
});

test('parallel scheduler retries transient failure and times out hung providers', async () => {
  const scheduler = new ParallelScheduler({ globalConcurrency: 2, retries: 1, backoffMs: 1, timeoutMs: 25, circuitBreakerFailures: 5 });
  let attempts = 0;
  const settled = await scheduler.run([
    { providerId: 'retry' },
    { providerId: 'hung' },
  ], async (task, _index, meta) => {
    if (task.providerId === 'retry') {
      attempts += 1;
      if (meta.attempt === 0) throw Object.assign(new Error('transient'), { code: 'TRANSIENT' });
      return 'recovered';
    }
    await new Promise((resolve) => setTimeout(resolve, 80));
    return 'late';
  });
  assert.equal(attempts, 2);
  assert.equal(settled[0].status, 'fulfilled');
  assert.equal(settled[0].value, 'recovered');
  assert.equal(settled[1].status, 'rejected');
  assert.equal(settled[1].reason.code, 'PROVIDER_TIMEOUT');
});

test('circuit breaker opens after repeated provider failures', async () => {
  const scheduler = new ParallelScheduler({ retries: 0, circuitBreakerFailures: 2, circuitBreakerCooldownMs: 60000 });
  const first = await scheduler.run([{ providerId: 'bad' }, { providerId: 'bad' }], async () => { throw new Error('boom'); });
  assert.equal(first.filter((x) => x.status === 'rejected').length, 2);
  const second = await scheduler.run([{ providerId: 'bad' }], async () => 'should-not-run');
  assert.equal(second[0].status, 'rejected');
  assert.equal(second[0].reason.code, 'PROVIDER_CIRCUIT_OPEN');
});

test('tournament deduplicates and prefers evidence', () => {
  const tournament = new ResultTournament();
  const ranked = tournament.rank([
    { text: 'same answer', confidence: 0.1 },
    { text: ' same   answer ', confidence: 0.9 },
    { text: 'better', confidence: 0.5, evidenceScore: 2, testsPassed: true, provenance: { x: 1 } },
  ]);
  assert.equal(ranked.length, 2);
  assert.equal(ranked[0].text, 'better');
});

test('augmentio fans out, tolerates failure, ranks, caches, and skips paid, unknown-cost, unverified, or unauthorized providers', async () => {
  let calls = 0;
  const pool = new ProviderPool([
    { id: 'fast', capabilities: ['GENERAL'], priority: 3, estimatedCost: 0, costProvenance: verifiedFree('fast'), invoke: async () => { calls++; return { text: 'candidate A', confidence: 0.4 }; } },
    { id: 'tested', capabilities: ['GENERAL'], priority: 2, estimatedCost: 0, costProvenance: verifiedFree('tested'), invoke: async () => { calls++; return { text: 'candidate B', confidence: 0.5, testsPassed: true, provenance: { source: 'test' } }; } },
    { id: 'paid', capabilities: ['GENERAL'], priority: 99, estimatedCost: 1, costProvenance: verifiedFree('paid'), invoke: async () => { calls++; return 'should not run'; } },
    { id: 'unknown-cost', capabilities: ['GENERAL'], priority: 98, costProvenance: verifiedFree('unknown-cost'), invoke: async () => { calls++; return 'should not run'; } },
    { id: 'unverified-zero', capabilities: ['GENERAL'], priority: 97, estimatedCost: 0, invoke: async () => { calls++; return 'should not run'; } },
    { id: 'unauthorized-zero', capabilities: ['GENERAL'], priority: 96, estimatedCost: 0, costProvenance: { verified: true, addedCost: 0, source: 'self-claim' }, invoke: async () => { calls++; return 'should not run'; } },
    { id: 'replayed-proof', capabilities: ['GENERAL'], priority: 95, estimatedCost: 0, costProvenance: verifiedFree('some-other-adapter'), invoke: async () => { calls++; return 'should not run'; } },
    { id: 'broken', capabilities: ['GENERAL'], priority: 1, estimatedCost: 0, costProvenance: verifiedFree('broken'), invoke: async () => { calls++; throw new Error('boom'); } },
  ]);
  const augmentio = new Augmentio({ pool, scheduler: new ParallelScheduler({ globalConcurrency: 4, retries: 0 }) });
  const first = await augmentio.fanOut({ input: 'solve this', maxCandidates: 8 });
  assert.equal(first.best.provider, 'tested');
  assert.equal(first.failures, 1);
  assert.equal(calls, 3, 'only explicitly authorized zero-cost providers should be invoked');
  const second = await augmentio.fanOut({ input: 'solve this', maxCandidates: 8 });
  assert.equal(second.cacheHit, true);
  assert.equal(calls, 3, 'cache should prevent repeat calls');
});
