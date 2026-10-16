import test from 'node:test';
import assert from 'node:assert/strict';
import { ProviderPool } from '../src/augmentio/provider-pool.js';
import { ZeroEuroGovernor, ZERO_EURO_POLICY } from '../src/augmentio/zero-euro-governor.js';
import { ParallelScheduler } from '../src/augmentio/parallel-scheduler.js';
import { ResultTournament } from '../src/augmentio/result-tournament.js';
import { Augmentio, boundedAugmentioCandidates } from '../src/augmentio/augmentio.js';
import { standardRegistry } from '../src/models/ModelRegistry.js';

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


test('Council CODE registry prefers Llama and exposes the current free fallback pool', () => {
  const codeModels = standardRegistry.modelsByCapability('CODE');
  assert.equal(codeModels[0]?.id, '@cf/meta/llama-3.3-70b-instruct-fp8-fast');
  assert.ok(codeModels.some((model) => model.id === '@cf/google/gemma-4-26b-a4b-it'));
  assert.ok(codeModels.some((model) => model.id === '@cf/nvidia/nemotron-3-120b-a12b'));
  assert.ok(codeModels.some((model) => model.id === '@cf/zai-org/glm-4.7-flash'));
  assert.equal(codeModels.some((model) => model.id === '@cf/moonshotai/kimi-k2.7-code'), false);
});

test('augmentio does not count blank or non-text model results as successful AI work', async () => {
  for (const invalid of ['   \n  ', { incomplete: true }, [], 123, { text: '   ' }, { response: '' }]) {
    const pool = new ProviderPool([
      { id: 'empty', capabilities: ['GENERAL'], priority: 3, estimatedCost: 0,
        costProvenance: verifiedFree('empty'), invoke: async () => invalid },
      { id: 'valid', capabilities: ['GENERAL'], priority: 2, estimatedCost: 0,
        costProvenance: verifiedFree('valid'), invoke: async () => ({ text: 'Real answer' }) },
    ]);
    const ai = new Augmentio({
      pool,
      scheduler: new ParallelScheduler({ globalConcurrency: 2, retries: 0 }),
    });
    const out = await ai.fanOut({ input: 'Require actual model output', maxCandidates: 2 });
    assert.equal(out.candidates.length, 1);
    assert.equal(out.best.text, 'Real answer');
    assert.equal(out.failures, 1);
    const cached = await ai.fanOut({ input: 'Require actual model output', maxCandidates: 2 });
    assert.equal(cached.cacheHit, true);
    assert.equal(cached.candidates.length, 1);
  }
});

test('augmentio fails closed and does not cache a false success when all models reply blank', async () => {
  const pool = new ProviderPool([
    { id: 'blank', capabilities: ['GENERAL'], priority: 1, estimatedCost: 0,
      costProvenance: verifiedFree('blank'), invoke: async () => '   ' },
  ]);
  const ai = new Augmentio({ pool, scheduler: new ParallelScheduler({ retries: 0 }) });
  await assert.rejects(
    ai.fanOut({ input: 'No false success' }),
    error => error?.code === 'ALL_PROVIDERS_FAILED'
      && error.failures?.some(x => x.includes('EMPTY_PROVIDER_RESPONSE')),
  );
});

test('direct Augmentio fanout respects a finite 12-model ceiling and cache equivalence', async () => {
  for (const [input, expected] of [
    [Number.POSITIVE_INFINITY, 4], [Number.NaN, 4], [1000000, 12],
    ['200', 12], [0, 1], [-10, 1], [2.7, 2], [3, 3],
  ]) {
    assert.equal(boundedAugmentioCandidates(input), expected);
  }
  let calls = 0;
  const pool = new ProviderPool(Array.from({ length: 18 }, (_, index) => {
    const id = 'safe-' + index;
    return {
      id, capabilities: ['GENERAL'], priority: 18 - index,
      estimatedCost: 0, costProvenance: verifiedFree(id),
      invoke: async () => { calls++; return 'candidate ' + index; },
    };
  }));
  const ai = new Augmentio({
    pool, scheduler: new ParallelScheduler({ globalConcurrency: 12, retries: 0 }),
  });
  const first = await ai.fanOut({ input: 'Bounded fanout', maxCandidates: 1000000 });
  assert.equal(first.providersAttempted.length, 12);
  assert.equal(calls, 12);
  const second = await ai.fanOut({ input: 'Bounded fanout', maxCandidates: 12 });
  assert.equal(second.cacheHit, true);
  assert.equal(calls, 12, 'equivalent bounded limits reuse identical cache');
});

test('Augmentio cache never bypasses revoked zero-euro authorization', async () => {
  let aCalls = 0;
  let bCalls = 0;
  const a = {
    id: 'a', capabilities: ['GENERAL'], priority: 2,
    estimatedCost: 0, costProvenance: verifiedFree('a'),
    invoke: async () => 'a response ' + (++aCalls),
  };
  const b = {
    id: 'b', capabilities: ['GENERAL'], priority: 1,
    estimatedCost: 0, costProvenance: verifiedFree('b'),
    invoke: async () => 'b response ' + (++bCalls),
  };
  const ai = new Augmentio({
    pool: new ProviderPool([a, b]),
    scheduler: new ParallelScheduler({ globalConcurrency: 2, retries: 0 }),
  });
  const first = await ai.fanOut({ input: 'exact input', maxCandidates: 2 });
  assert.deepEqual(first.providersAttempted, ['a', 'b']);
  assert.equal(aCalls, 1);
  assert.equal(bCalls, 1);

  b.estimatedCost = 1; // Governance changes while old answer remains cached.
  const second = await ai.fanOut({ input: 'exact input', maxCandidates: 2 });
  assert.equal(second.cacheHit, false);
  assert.deepEqual(second.providersAttempted, ['a']);
  assert.equal(aCalls, 2);
  assert.equal(bCalls, 1, 'revoked provider must not be invoked again');
  const repeated = await ai.fanOut({ input: 'exact input', maxCandidates: 2 });
  assert.equal(repeated.cacheHit, true);
  assert.deepEqual(repeated.providersAttempted, ['a']);

  a.estimatedCost = 1;
  await assert.rejects(
    ai.fanOut({ input: 'exact input', maxCandidates: 2 }),
    error => error?.code === 'NO_ZERO_COST_PROVIDER_AVAILABLE',
  );
});

test('Augmentio cache is invalidated when an eligible adapter changes its model', async () => {
  let calls = 0;
  const adapter = {
    id: 'a', providerId: 'workers-ai', modelId: 'model-old',
    capabilities: ['GENERAL'], estimatedCost: 0,
    costProvenance: verifiedFree('a', { provider: 'workers-ai', model: 'model-old' }),
    invoke: async () => 'answer ' + (++calls),
  };
  const ai = new Augmentio({
    pool: new ProviderPool([adapter]),
    scheduler: new ParallelScheduler({ retries: 0 }),
  });
  assert.equal((await ai.fanOut({ input: 'same prompt' })).providerHealth[0].model, 'model-old');
  assert.equal((await ai.fanOut({ input: 'same prompt' })).cacheHit, true);
  adapter.modelId = 'model-new';
  adapter.costProvenance = verifiedFree('a', { provider: 'workers-ai', model: 'model-new' });
  const changed = await ai.fanOut({ input: 'same prompt' });
  assert.equal(changed.cacheHit, false);
  assert.equal(changed.providerHealth[0].model, 'model-new');
  assert.equal(calls, 2);
});

test('Augmentio rechecks authorization at cache read time', async () => {
  let calls = 0;
  const adapter = {
    id: 'a', capabilities: ['GENERAL'], estimatedCost: 0,
    costProvenance: verifiedFree('a'),
    invoke: async () => { calls++; return 'should not run'; },
  };
  const cache = {
    async get() {
      adapter.estimatedCost = 5; // Revoked after selection, before cache return.
      return { best: { text: 'stale answer' }, candidates: [], providersAttempted: ['a'] };
    },
    async set() { throw new Error('invalid cache write'); },
  };
  const ai = new Augmentio({ pool: new ProviderPool([adapter]), cache,
    scheduler: new ParallelScheduler({ retries: 0 }) });
  await assert.rejects(ai.fanOut({ input: 'cached input' }),
    error => error?.code === 'ALL_PROVIDERS_FAILED'
      && error.failures?.some(reason => reason.includes('ZERO_EURO_BUDGET_EXCEEDED')));
  assert.equal(calls, 0);
});

test('parallel scheduler cancels promptly even if active provider ignores abort signal', async () => {
  const scheduler = new ParallelScheduler({
    globalConcurrency: 1, retries: 3, backoffMs: 1, timeoutMs: 60000,
  });
  const controller = new AbortController();
  let invoked = 0;
  const started = Date.now();
  const run = scheduler.run([{ id: 'active' }, { id: 'pending' }], async () => {
    invoked += 1;
    return new Promise(() => {}); // Deliberately ignores AbortSignal.
  }, { signal: controller.signal });
  setTimeout(() => controller.abort('owner-cancelled'), 15);
  const results = await run;
  assert.ok(Date.now() - started < 2000, 'abort must not wait for provider timeout');
  assert.equal(invoked, 1, 'pending and retry calls must not run after cancel');
  assert.deepEqual(results.map(row => row.status), ['rejected', 'rejected']);
  assert.ok(results.every(row => row.reason.code === 'SCHEDULER_ABORTED'));
  assert.equal(scheduler.breaker('active').failures, 0,
    'owner cancellation must not be recorded as a provider failure');
});

test('parallel scheduler rejects an already-aborted request without invoking any provider', async () => {
  const controller = new AbortController();
  controller.abort();
  let invoked = 0;
  const results = await new ParallelScheduler({ retries: 2 }).run(
    [{ id: 'a' }, { id: 'b' }],
    async () => { invoked += 1; return 'invalid success'; },
    { signal: controller.signal },
  );
  assert.equal(invoked, 0);
  assert.ok(results.every(row => row.status === 'rejected'
    && row.reason.code === 'SCHEDULER_ABORTED'));
});

test('result tournament retains the strongest provenance among duplicate answers', () => {
  const tournament = new ResultTournament();
  const ranked = tournament.rank([
    { text: 'SAME answer', confidence: 0.1 },
    { text: ' same   answer ', confidence: 0.95, evidenceScore: 2, provenance: { verified: true } },
    { text: 'different answer', evidenceScore: 1 },
  ]);
  assert.equal(ranked.length, 2);
  assert.equal(ranked[0].confidence, 0.95);
  assert.equal(ranked[0].provenance.verified, true);
  assert.equal(ranked[0].tournamentScore, 3.95);
});

test('result tournament does not promote NaN, Infinity or huge AI-supplied scores', () => {
  const tournament = new ResultTournament();
  const candidates = tournament.rank([
    { text: 'valid answer', evidenceScore: 5, confidence: 0.6 },
    { text: 'bad nonfinite', evidenceScore: Infinity, confidence: NaN },
    { text: 'also nonfinite', evidenceScore: NaN, confidence: -Infinity },
  ]);
  assert.equal(candidates[0].text, 'valid answer');
  assert.ok(candidates.every(row => Number.isFinite(row.tournamentScore)));
  assert.equal(tournament.score({ evidenceScore: Number.MAX_VALUE, confidence: Number.MAX_VALUE }), 2_000_000);
});

test('a cancelled request cannot reuse an already cached Augmentio answer', async () => {
  let calls = 0;
  const pool = new ProviderPool([{
    id: 'one', capabilities: ['GENERAL'], priority: 1,
    estimatedCost: 0, costProvenance: verifiedFree('one'),
    invoke: async () => { calls += 1; return 'real answer'; },
  }]);
  const ai = new Augmentio({ pool, scheduler: new ParallelScheduler({ retries: 0 }) });
  const first = await ai.fanOut({ input: 'cache then cancel' });
  assert.equal(first.cacheHit, false);
  const controller = new AbortController();
  controller.abort('owner-cancelled');
  await assert.rejects(ai.fanOut({ input: 'cache then cancel', signal: controller.signal }),
    error => error?.code === 'SCHEDULER_ABORTED');
  assert.equal(calls, 1);
});

test('Augmentio never caches an in-flight multi-model batch cancelled after partial success', async () => {
  let fastCalls = 0;
  let slowCalls = 0;
  const pool = new ProviderPool([
    {
      id: 'fast', capabilities: ['GENERAL'], priority: 2,
      estimatedCost: 0, costProvenance: verifiedFree('fast'),
      invoke: async () => { fastCalls += 1; return 'fast success'; },
    },
    {
      id: 'slow', capabilities: ['GENERAL'], priority: 1,
      estimatedCost: 0, costProvenance: verifiedFree('slow'),
      invoke: async () => { slowCalls += 1; return new Promise(() => {}); },
    },
  ]);
  const ai = new Augmentio({
    pool,
    scheduler: new ParallelScheduler({ globalConcurrency: 2, retries: 0, timeoutMs: 60_000 }),
  });
  const controller = new AbortController();
  const started = Date.now();
  const result = ai.fanOut({ input: 'cancel an incomplete batch', maxCandidates: 2,
    signal: controller.signal });
  setTimeout(() => controller.abort('owner-cancelled'), 20);
  await assert.rejects(result, error => error?.code === 'SCHEDULER_ABORTED');
  assert.ok(Date.now() - started < 3000);
  assert.equal(fastCalls, 1);
  assert.equal(slowCalls, 1);
  assert.equal(ai.cache.entries.size, 0, 'partial results must not become cache entries');
});

test('Augmentio ignores a late provider response after its attempt is cancelled', async () => {
  let finish;
  let calls = 0;
  const pool = new ProviderPool([{
    id: 'late', capabilities: ['GENERAL'], priority: 1,
    estimatedCost: 0, costProvenance: verifiedFree('late'),
    invoke: async () => {
      calls += 1;
      return new Promise(resolve => { finish = resolve; });
    },
  }]);
  const ai = new Augmentio({
    pool, scheduler: new ParallelScheduler({ retries: 0, timeoutMs: 60_000 }),
  });
  const controller = new AbortController();
  const running = ai.fanOut({ input: 'late output', signal: controller.signal });
  while (!finish) await new Promise(resolve => setImmediate(resolve));
  controller.abort('owner-cancelled');
  await assert.rejects(running, error => error?.code === 'SCHEDULER_ABORTED');
  finish('too-late answer');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls, 1);
  assert.equal(ai.quota.get('late').calls, 0, 'late answer must not be recorded as a success');
  assert.equal(ai.cache.entries.size, 0);
});

test('parallel scheduler exits a long retry backoff promptly when MEL cancels', async () => {
  const controller = new AbortController();
  let attempts = 0;
  let firstAttemptStarted;
  const started = new Promise(resolve => { firstAttemptStarted = resolve; });
  const scheduler = new ParallelScheduler({
    globalConcurrency: 1, retries: 4, backoffMs: 60_000,
    timeoutMs: 60_000, circuitBreakerFailures: 10,
  });
  const began = Date.now();
  const running = scheduler.run([{ id: 'retry-provider' }], async () => {
    attempts += 1;
    firstAttemptStarted();
    throw new Error('transient provider failure');
  }, { signal: controller.signal });
  await started;
  await new Promise(resolve => setImmediate(resolve));
  controller.abort('owner-stopped-work');
  const results = await running;
  assert.ok(Date.now() - began < 2500, 'cancel must interrupt a one-minute backoff');
  assert.equal(attempts, 1, 'no second invocation after cancellation');
  assert.equal(results.length, 1);
  assert.equal(results[0].status, 'rejected');
  assert.equal(results[0].reason?.code, 'SCHEDULER_ABORTED');
});

test('parallel AI scheduler clamps untrusted concurrency, retry and timeout options', async () => {
  const defaults = new ParallelScheduler({
    globalConcurrency: Infinity, perProviderConcurrency: NaN, retries: Infinity,
    timeoutMs: Infinity, backoffMs: NaN, circuitBreakerFailures: Infinity,
    circuitBreakerCooldownMs: Infinity,
  });
  assert.equal(defaults.globalConcurrency, 8);
  assert.equal(defaults.perProviderConcurrency, 2);
  assert.equal(defaults.retries, 1);
  assert.equal(defaults.timeoutMs, 30_000);
  assert.equal(defaults.backoffMs, 100);
  assert.equal(defaults.circuitBreakerFailures, 3);
  assert.equal(defaults.circuitBreakerCooldownMs, 60_000);

  const maxed = new ParallelScheduler({
    globalConcurrency: 1_000_000, perProviderConcurrency: 1_000_000,
    retries: 1_000_000, timeoutMs: 1_000_000, backoffMs: 1_000_000,
    circuitBreakerFailures: 1_000_000, circuitBreakerCooldownMs: 1_000_000_000,
  });
  assert.equal(maxed.globalConcurrency, 32);
  assert.equal(maxed.perProviderConcurrency, 16);
  assert.equal(maxed.retries, 5);
  assert.equal(maxed.timeoutMs, 120_000);
  assert.equal(maxed.backoffMs, 30_000);
  assert.equal(maxed.circuitBreakerFailures, 100);
  assert.equal(maxed.circuitBreakerCooldownMs, 3_600_000);
});

test('a huge requested retry count cannot trap MEL in endless failed AI calls', async () => {
  let calls = 0;
  const scheduler = new ParallelScheduler({
    retries: 1_000_000, backoffMs: 0, circuitBreakerFailures: 100,
  });
  const settled = await scheduler.run([{ id: 'always-fails' }], async () => {
    calls += 1;
    throw new Error('service unavailable');
  });
  assert.equal(calls, 6, 'at most five retries after the first attempt');
  assert.equal(settled.length, 1);
  assert.equal(settled[0].status, 'rejected');
  assert.match(settled[0].reason.message, /service unavailable/);
});
