import test from 'node:test';
import assert from 'node:assert/strict';
import { ProviderPool } from '../src/augmentio/provider-pool.js';
import { ProviderAdapter } from '../src/augmentio/provider-adapter.js';
import { ZeroEuroGovernor, ZERO_EURO_POLICY } from '../src/augmentio/zero-euro-governor.js';
import { ParallelScheduler } from '../src/augmentio/parallel-scheduler.js';
import { ResultTournament } from '../src/augmentio/result-tournament.js';
import { Augmentio, boundedAugmentioCandidates, MAX_AUGMENTIO_RESPONSE_CHARS, PARTIAL_FANOUT_CACHE_TTL_MS } from '../src/augmentio/augmentio.js';
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
    error => error?.code === 'AUGMENTIO_PROVIDER_ROSTER_CHANGED');
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

test('Augmentio rejects oversized model replies without caching them as successes', async () => {
  const oversized = 'x'.repeat(MAX_AUGMENTIO_RESPONSE_CHARS + 1);
  let calls = 0;
  const pool = new ProviderPool([
    { id: 'huge', capabilities: ['GENERAL'], priority: 2, estimatedCost: 0,
      costProvenance: verifiedFree('huge'), invoke: async () => { calls++; return oversized; } },
    { id: 'normal', capabilities: ['GENERAL'], priority: 1, estimatedCost: 0,
      costProvenance: verifiedFree('normal'), invoke: async () => 'valid model output' },
  ]);
  const ai = new Augmentio({
    pool, scheduler: new ParallelScheduler({ retries: 0, globalConcurrency: 2 }),
  });
  const response = await ai.fanOut({ input: 'bounded-output-proof', maxCandidates: 2 });
  assert.equal(response.failures, 1);
  assert.equal(response.candidates.length, 1);
  assert.equal(response.best.text, 'valid model output');
  assert.equal(calls, 1);
  assert.equal((await ai.fanOut({ input: 'bounded-output-proof', maxCandidates: 2 })).cacheHit, true);
});

test('Augmentio fails closed when all AI models exceed the response limit', async () => {
  const tooLarge = 'x'.repeat(MAX_AUGMENTIO_RESPONSE_CHARS + 1);
  const pool = new ProviderPool([{
    id: 'huge', capabilities: ['GENERAL'], estimatedCost: 0,
    costProvenance: verifiedFree('huge'), invoke: async () => ({ text: tooLarge }),
  }]);
  const ai = new Augmentio({ pool, scheduler: new ParallelScheduler({ retries: 0 }) });
  await assert.rejects(
    ai.fanOut({ input: 'all outputs oversized' }),
    error => error?.code === 'ALL_PROVIDERS_FAILED'
      && error.failures?.some(reason => reason.includes('AI_PROVIDER_RESPONSE_TOO_LARGE')),
  );
  assert.equal(ai.cache.entries.size, 0);
});

test('Augmentio accepts the exact configured response ceiling', async () => {
  const exact = 'x'.repeat(MAX_AUGMENTIO_RESPONSE_CHARS);
  const pool = new ProviderPool([{
    id: 'max', capabilities: ['GENERAL'], estimatedCost: 0,
    costProvenance: verifiedFree('max'), invoke: async () => exact,
  }]);
  const ai = new Augmentio({ pool, scheduler: new ParallelScheduler({ retries: 0 }) });
  const result = await ai.fanOut({ input: 'max model output' });
  assert.equal(result.best.text.length, MAX_AUGMENTIO_RESPONSE_CHARS);
});

test('Augmentio refuses to call models when pool health refresh never finishes', async () => {
  let listCalls = 0;
  const pool = {
    async refreshHealth() { return new Promise(() => {}); },
    list() { listCalls++; return []; },
  };
  const ai = new Augmentio({ pool, healthRefreshTimeoutMs: 20 });
  const started = Date.now();
  await assert.rejects(
    ai.fanOut({ input: 'do not wait forever' }),
    error => error?.code === 'AUGMENTIO_HEALTH_REFRESH_TIMEOUT',
  );
  assert.ok(Date.now() - started < 2000);
  assert.equal(listCalls, 0, 'models must not be selected after an unverified health probe');
});

test('Augmentio immediately cancels a pending health refresh with owner AbortSignal', async () => {
  let listCalls = 0;
  const pool = {
    async refreshHealth() { return new Promise(() => {}); },
    list() { listCalls++; return []; },
  };
  const controller = new AbortController();
  const ai = new Augmentio({ pool, healthRefreshTimeoutMs: 30_000 });
  const started = Date.now();
  const execution = ai.fanOut({ input: 'cancel pending health refresh', signal: controller.signal });
  setTimeout(() => controller.abort('owner-cancelled'), 15);
  await assert.rejects(execution, error => error?.code === 'SCHEDULER_ABORTED');
  assert.ok(Date.now() - started < 2000);
  assert.equal(listCalls, 0);
});

test('Augmentio bounds the health refresh deadline configuration', () => {
  assert.equal(new Augmentio({ healthRefreshTimeoutMs: Infinity }).healthRefreshTimeoutMs, 5000);
  assert.equal(new Augmentio({ healthRefreshTimeoutMs: -100 }).healthRefreshTimeoutMs, 10);
  assert.equal(new Augmentio({ healthRefreshTimeoutMs: 200000 }).healthRefreshTimeoutMs, 30000);
});

test('partial fan-out result expires quickly and recovered AI is consulted again', async () => {
  let failPeer = true;
  let recoveringCalls = 0;
  const pool = new ProviderPool([
    { id: 'reliable', capabilities: ['GENERAL'], priority: 2, estimatedCost: 0,
      costProvenance: verifiedFree('reliable'), invoke: async () => 'reliable answer' },
    { id: 'recovering', capabilities: ['GENERAL'], priority: 1, estimatedCost: 0,
      costProvenance: verifiedFree('recovering'), invoke: async () => {
        recoveringCalls += 1;
        if (failPeer) throw new Error('temporary outage');
        return 'recovered independent answer';
      } },
  ]);
  const ai = new Augmentio({
    pool, scheduler: new ParallelScheduler({ retries: 0, circuitBreakerFailures: 10 }),
  });
  const first = await ai.fanOut({ input: 'retry recovering peer', maxCandidates: 2 });
  assert.equal(first.failures, 1);
  assert.equal(recoveringCalls, 1);
  assert.equal(ai.cache.entries.size, 1);
  const entry = [...ai.cache.entries.values()][0];
  const remaining = entry.expiresAt - Date.now();
  assert.ok(remaining > 0 && remaining <= PARTIAL_FANOUT_CACHE_TTL_MS);
  failPeer = false;
  const immediate = await ai.fanOut({ input: 'retry recovering peer', maxCandidates: 2 });
  assert.equal(immediate.cacheHit, true);
  assert.equal(recoveringCalls, 1);
  entry.expiresAt = Date.now() - 1; // Simulate natural TTL expiry without sleeping 10s.
  const recovered = await ai.fanOut({ input: 'retry recovering peer', maxCandidates: 2 });
  assert.equal(recovered.cacheHit, false);
  assert.equal(recovered.failures, 0);
  assert.equal(recoveringCalls, 2);
  assert.equal(recovered.candidates.length, 2);
});

test('fully successful fan-outs retain standard longer-lived caching', async () => {
  const pool = new ProviderPool([{
    id: 'healthy', capabilities: ['GENERAL'], estimatedCost: 0,
    costProvenance: verifiedFree('healthy'), invoke: async () => 'ok',
  }]);
  const ai = new Augmentio({ pool, scheduler: new ParallelScheduler({ retries: 0 }) });
  const response = await ai.fanOut({ input: 'fully healthy' });
  assert.equal(response.failures, 0);
  const entry = [...ai.cache.entries.values()][0];
  assert.ok(entry.expiresAt - Date.now() > PARTIAL_FANOUT_CACHE_TTL_MS);
});

test('one hung model health probe is quarantined while healthy peers remain usable', async () => {
  let releaseHung;
  let hungInvocations = 0;
  let healthyInvocations = 0;
  const hung = {
    id: 'hung', capabilities: ['GENERAL'], priority: 5,
    estimatedCost: 0, costProvenance: verifiedFree('hung'),
    health: async () => new Promise(resolve => { releaseHung = resolve; }),
    invoke: async () => { hungInvocations++; return 'should not run'; },
  };
  const healthy = {
    id: 'healthy', capabilities: ['GENERAL'], priority: 1,
    estimatedCost: 0, costProvenance: verifiedFree('healthy'),
    health: async () => 'HEALTHY',
    invoke: async () => { healthyInvocations++; return 'working model'; },
  };
  const pool = new ProviderPool([hung, healthy], { healthCheckTimeoutMs: 25 });
  const ai = new Augmentio({
    pool,
    scheduler: new ParallelScheduler({ retries: 0, timeoutMs: 1000 }),
    healthRefreshTimeoutMs: 500,
  });
  const started = Date.now();
  const result = await ai.fanOut({ input: 'isolate hung health check', maxCandidates: 2 });
  assert.ok(Date.now() - started < 1500);
  assert.equal(result.best.text, 'working model');
  assert.deepEqual(result.providersAttempted, ['healthy']);
  assert.equal(hung.healthStatus, 'UNAVAILABLE');
  assert.equal(hungInvocations, 0, 'unverified provider must not be invoked');
  assert.equal(healthyInvocations, 1);
  releaseHung('HEALTHY');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(hung.healthStatus, 'UNAVAILABLE', 'late probe cannot remove timeout quarantine');
});

test('provider health isolation respects bounded settings and remains fail-closed', async () => {
  const pool = new ProviderPool([{
    id: 'unreachable', capabilities: ['GENERAL'],
    health: async () => new Promise(() => {}),
    invoke: async () => 'never',
  }], { healthCheckTimeoutMs: 10 });
  await pool.refreshHealth();
  assert.equal(pool.list({ capability: 'GENERAL' }).length, 0);
  assert.equal(new ProviderPool([], { healthCheckTimeoutMs: Infinity }).healthCheckTimeoutMs, 1500);
  assert.equal(new ProviderPool([], { healthCheckTimeoutMs: 999999 }).healthCheckTimeoutMs, 30000);
});

test('Augmentio refuses a cached response if its provider is disabled during the cache read', async () => {
  let invoked = 0;
  const adapter = {
    id: 'disable-me', capabilities: ['GENERAL'], estimatedCost: 0,
    costProvenance: verifiedFree('disable-me'),
    invoke: async () => { invoked++; return 'never'; },
  };
  const cache = {
    async get() {
      adapter.enabled = false;
      return { best: { text: 'stale cached answer' }, candidates: [] };
    },
    async set() { throw new Error('should not cache'); },
  };
  const ai = new Augmentio({
    pool: new ProviderPool([adapter]), cache,
    scheduler: new ParallelScheduler({ retries: 0 }),
  });
  await assert.rejects(ai.fanOut({ input: 'owner revoked provider' }),
    error => error?.code === 'AUGMENTIO_PROVIDER_ROSTER_CHANGED');
  assert.equal(invoked, 0);
});

test('Augmentio refuses a cached response if the provider model changes mid-lookup', async () => {
  let invoked = 0;
  const adapter = {
    id: 'mutable', providerId: 'workers-ai', modelId: 'previous-model',
    capabilities: ['GENERAL'], estimatedCost: 0,
    costProvenance: verifiedFree('mutable', { provider: 'workers-ai', model: 'previous-model' }),
    invoke: async () => { invoked++; return 'never'; },
  };
  const cache = {
    async get() {
      adapter.modelId = 'replacement-model';
      adapter.costProvenance = verifiedFree('mutable', { provider: 'workers-ai', model: 'replacement-model' });
      return { best: { text: 'old model response' } };
    },
    async set() {},
  };
  const ai = new Augmentio({ pool: new ProviderPool([adapter]), cache });
  await assert.rejects(ai.fanOut({ input: 'model swapped' }),
    error => error?.code === 'AUGMENTIO_PROVIDER_ROSTER_CHANGED');
  assert.equal(invoked, 0);
});

test('Augmentio rechecks provider enabled state immediately before calling a model', async () => {
  let invoked = 0;
  const adapter = {
    id: 'late-disable', capabilities: ['GENERAL'], estimatedCost: 0,
    costProvenance: verifiedFree('late-disable'),
    invoke: async () => { invoked++; return 'should not be called'; },
  };
  const scheduler = {
    async run(tasks, worker) {
      adapter.enabled = false;
      return Promise.allSettled(tasks.map((task, index) => worker(task, index, {})));
    },
  };
  const ai = new Augmentio({ pool: new ProviderPool([adapter]), scheduler });
  await assert.rejects(ai.fanOut({ input: 'late owner disable' }),
    error => error?.code === 'ALL_PROVIDERS_FAILED'
      && error.failures?.some(reason => reason.includes('AUGMENTIO_PROVIDER_DISABLED')));
  assert.equal(invoked, 0);
});

test('Augmentio replaces false provider/model provenance with the actual authorized route', async () => {
  const adapter = {
    id: 'auth-adapter', providerId: 'workers-ai', modelId: 'model-real',
    capabilities: ['GENERAL'], estimatedCost: 0,
    costProvenance: verifiedFree('auth-adapter', { provider: 'workers-ai', model: 'model-real' }),
    invoke: async () => ({
      text: 'grounded response',
      provenance: { provider: 'forged-provider', model: 'forged-model',
        adapter_id: 'forged-adapter', source: 'verified-test-source' },
    }),
  };
  const ai = new Augmentio({
    pool: new ProviderPool([adapter]),
    scheduler: new ParallelScheduler({ retries: 0 }),
  });
  const result = await ai.fanOut({ input: 'prove actual model provenance' });
  assert.equal(result.best.provider, 'workers-ai');
  assert.equal(result.best.model, 'model-real');
  assert.equal(result.best.adapterId, 'auth-adapter');
  assert.deepEqual(result.best.provenance, {
    provider: 'workers-ai', model: 'model-real',
    adapter_id: 'auth-adapter', source: 'verified-test-source',
  });
  assert.equal((await ai.fanOut({ input: 'prove actual model provenance' })).cacheHit, true);
});

test('Augmentio fails closed when a selected model is replaced before invocation', async () => {
  let invoked = 0;
  const adapter = {
    id: 'replace', providerId: 'workers-ai', modelId: 'original',
    capabilities: ['GENERAL'], estimatedCost: 0,
    costProvenance: verifiedFree('replace', { provider: 'workers-ai', model: 'original' }),
    invoke: async () => { invoked++; return 'untrusted'; },
  };
  const scheduler = {
    async run(tasks, worker) {
      adapter.modelId = 'replaced';
      adapter.costProvenance = verifiedFree('replace', { provider: 'workers-ai', model: 'replaced' });
      return Promise.allSettled(tasks.map((task, index) => worker(task, index, {})));
    },
  };
  const ai = new Augmentio({ pool: new ProviderPool([adapter]), scheduler });
  await assert.rejects(ai.fanOut({ input: 'exact model proof' }),
    error => error?.code === 'ALL_PROVIDERS_FAILED'
      && error.failures?.some(x => x.includes('AUGMENTIO_PROVIDER_IDENTITY_CHANGED')));
  assert.equal(invoked, 0);
});

test('Augmentio fails closed when a model identity mutates while generating', async () => {
  const adapter = {
    id: 'mutable', providerId: 'workers-ai', modelId: 'original',
    capabilities: ['GENERAL'], estimatedCost: 0,
    costProvenance: verifiedFree('mutable', { provider: 'workers-ai', model: 'original' }),
    invoke: async () => {
      adapter.modelId = 'unknown-other-model';
      return { text: 'should not certify', provenance: { provider: 'workers-ai', model: 'original' } };
    },
  };
  const ai = new Augmentio({
    pool: new ProviderPool([adapter]),
    scheduler: new ParallelScheduler({ retries: 0 }),
  });
  await assert.rejects(ai.fanOut({ input: 'preserve exact route' }),
    error => error?.code === 'ALL_PROVIDERS_FAILED'
      && error.failures?.some(x => x.includes('AUGMENTIO_PROVIDER_IDENTITY_CHANGED')));
  assert.equal(ai.cache.entries.size, 0);
});

test('Augmentio records actual adapter invocations, not circuit-open scheduled providers', async () => {
  let blockedCalls = 0;
  let healthyCalls = 0;
  const pool = new ProviderPool([
    { id: 'blocked', providerId: 'workers-ai', modelId: 'blocked-model',
      priority: 3, capabilities: ['GENERAL'], estimatedCost: 0,
      costProvenance: verifiedFree('blocked', { provider: 'workers-ai', model: 'blocked-model' }),
      invoke: async () => { blockedCalls++; return 'never invoked'; } },
    { id: 'healthy', providerId: 'workers-ai', modelId: 'healthy-model',
      priority: 2, capabilities: ['GENERAL'], estimatedCost: 0,
      costProvenance: verifiedFree('healthy', { provider: 'workers-ai', model: 'healthy-model' }),
      invoke: async () => { healthyCalls++; return 'real model response'; } },
  ]);
  const scheduler = new ParallelScheduler({
    retries: 0, circuitBreakerFailures: 1, circuitBreakerCooldownMs: 60000,
  });
  scheduler.markFailure('blocked'); // The scheduler will not invoke this adapter.
  const ai = new Augmentio({ pool, scheduler });
  const result = await ai.fanOut({ input: 'prove invoked model only', maxCandidates: 2 });
  assert.equal(result.best.text, 'real model response');
  assert.equal(result.failures, 0, 'known-open circuits are skipped before scheduling');
  assert.equal(blockedCalls, 0);
  assert.equal(healthyCalls, 1);
  assert.deepEqual(result.providersAttempted, ['healthy']);
  assert.deepEqual(result.providerHealth.map(x => [x.id, x.model]), [
    ['healthy', 'healthy-model'],
  ], 'only callable models occupy selection slots');
});

test('Augmentio never counts an authorization-revoked model as attempted', async () => {
  let calls = 0;
  const revoked = {
    id: 'revoked', priority: 2, capabilities: ['GENERAL'], estimatedCost: 0,
    costProvenance: verifiedFree('revoked'),
    invoke: async () => { calls++; return 'invalid'; },
  };
  const healthy = {
    id: 'healthy', priority: 1, capabilities: ['GENERAL'], estimatedCost: 0,
    costProvenance: verifiedFree('healthy'),
    invoke: async () => 'valid',
  };
  const scheduler = {
    async run(tasks, worker) {
      revoked.estimatedCost = 1;
      return Promise.allSettled(tasks.map((task, index) => worker(task, index, {})));
    },
  };
  const ai = new Augmentio({ pool: new ProviderPool([revoked, healthy]), scheduler });
  const result = await ai.fanOut({ input: 'no misleading attempts' });
  assert.deepEqual(result.providersAttempted, ['healthy']);
  assert.equal(calls, 0);
  assert.equal(result.failures, 1);
});

test('Augmentio provider health report preserves the selected model identity', async () => {
  const first = {
    id: 'a', providerId: 'workers-ai', modelId: 'model-a', priority: 2,
    capabilities: ['GENERAL'], estimatedCost: 0,
    costProvenance: verifiedFree('a', { provider: 'workers-ai', model: 'model-a' }),
    invoke: async () => 'first reply',
  };
  const second = {
    id: 'b', providerId: 'workers-ai', modelId: 'model-b', priority: 1,
    capabilities: ['GENERAL'], estimatedCost: 0,
    costProvenance: verifiedFree('b', { provider: 'workers-ai', model: 'model-b' }),
    invoke: async () => {
      first.modelId = 'new-model-not-invoked';
      return 'second reply';
    },
  };
  const ai = new Augmentio({
    pool: new ProviderPool([first, second]),
    scheduler: new ParallelScheduler({ globalConcurrency: 1, retries: 0 }),
  });
  const result = await ai.fanOut({ input: 'stable provider evidence', maxCandidates: 2 });
  assert.deepEqual(result.providersAttempted, ['a', 'b']);
  assert.equal(result.providerHealth[0].model, 'model-a');
  assert.equal(result.candidates.length, 2);
});

test('ProviderAdapter never starts a pre-cancelled AI request or credits it', async () => {
  let calls = 0;
  const adapter = new ProviderAdapter({ id: 'pre-cancelled',
    invoke: async () => { calls++; return 'invalid success'; } });
  const controller = new AbortController();
  controller.abort('owner-cancelled');
  await assert.rejects(adapter.invoke({ signal: controller.signal }),
    error => error?.code === 'PROVIDER_ABORTED');
  assert.equal(calls, 0);
  assert.equal(adapter.stats.calls, 0);
  assert.equal(adapter.stats.successes, 0);
  assert.equal(adapter.stats.failures, 0);
});

test('ProviderAdapter ignores a late AI success after cancellation without changing health metrics', async () => {
  let resolveLate;
  let started;
  const invoked = new Promise(resolve => { started = resolve; });
  const adapter = new ProviderAdapter({
    id: 'ignores-abort',
    invoke: async () => {
      started();
      return new Promise(resolve => { resolveLate = resolve; });
    },
  });
  const controller = new AbortController();
  const running = adapter.invoke({ signal: controller.signal });
  await invoked;
  controller.abort('owner-cancelled');
  resolveLate('late answer');
  await assert.rejects(running, error => error?.code === 'PROVIDER_ABORTED');
  assert.equal(adapter.stats.calls, 1);
  assert.equal(adapter.stats.successes, 0);
  assert.equal(adapter.stats.failures, 0);
  assert.equal(adapter.healthStatus, 'UNKNOWN');
});

test('Augmentio does not credit a timed-out AI provider when its late output arrives', async () => {
  let finishSlow;
  let slowStarted;
  const started = new Promise(resolve => { slowStarted = resolve; });
  const slow = new ProviderAdapter({
    id: 'slow', priority: 2, estimatedCost: 0,
    costProvenance: verifiedFree('slow', { provider: 'slow', model: 'slow' }),
    invoke: async () => {
      slowStarted();
      return new Promise(resolve => { finishSlow = resolve; });
    },
  });
  const fast = {
    id: 'fast', priority: 1, capabilities: ['GENERAL'], estimatedCost: 0,
    costProvenance: verifiedFree('fast'), invoke: async () => 'real reply',
  };
  const ai = new Augmentio({
    pool: new ProviderPool([slow, fast]),
    scheduler: new ParallelScheduler({ retries: 0, timeoutMs: 25, globalConcurrency: 2 }),
  });
  const running = ai.fanOut({ input: 'timeout and late provider', maxCandidates: 2 });
  await started;
  const result = await running;
  assert.equal(result.failures, 1);
  assert.equal(result.best.text, 'real reply');
  finishSlow('too late');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(slow.stats.calls, 1);
  assert.equal(slow.stats.successes, 0);
  assert.equal(slow.stats.failures, 0);
  assert.equal(ai.quota.get('slow').calls, 0);
});

test('Augmentio fills both multi-AI slots even when the highest-priority model has an open circuit', async () => {
  const calls = [];
  const pool = new ProviderPool([
    { id: 'blocked', priority: 3, capabilities: ['GENERAL'], estimatedCost: 0,
      costProvenance: verifiedFree('blocked'), invoke: async () => { calls.push('blocked'); return 'bad'; } },
    { id: 'second', priority: 2, capabilities: ['GENERAL'], estimatedCost: 0,
      costProvenance: verifiedFree('second'), invoke: async () => { calls.push('second'); return 'answer 2'; } },
    { id: 'third', priority: 1, capabilities: ['GENERAL'], estimatedCost: 0,
      costProvenance: verifiedFree('third'), invoke: async () => { calls.push('third'); return 'answer 3'; } },
  ]);
  const scheduler = new ParallelScheduler({ circuitBreakerFailures: 1, retries: 0 });
  scheduler.markFailure('blocked');
  const ai = new Augmentio({ pool, scheduler });
  const result = await ai.fanOut({ input: 'two independent usable models', maxCandidates: 2 });
  assert.deepEqual(result.providersAttempted, ['second', 'third']);
  assert.deepEqual(calls.sort(), ['second', 'third']);
  assert.equal(result.candidates.length, 2);
  assert.equal(result.failures, 0);
  assert.equal(result.cacheHit, false);
});

test('Augmentio refuses stale cache if a selected AI circuit opens during async lookup', async () => {
  let called = 0;
  const adapter = { id: 'model', capabilities: ['GENERAL'], estimatedCost: 0,
    costProvenance: verifiedFree('model'),
    invoke: async () => { called++; return 'do not call'; } };
  const scheduler = new ParallelScheduler({ circuitBreakerFailures: 1, retries: 0 });
  const cache = {
    async get() {
      scheduler.markFailure('model');
      return { best: { text: 'cached output' }, candidates: [] };
    },
    async set() { throw new Error('should not cache'); },
  };
  const ai = new Augmentio({ pool: new ProviderPool([adapter]), scheduler, cache });
  await assert.rejects(ai.fanOut({ input: 'do not serve open-circuit cache' }),
    error => error?.code === 'AUGMENTIO_PROVIDER_ROSTER_CHANGED');
  assert.equal(called, 0);
});

test('Augmentio drops an AI answer when its zero-cost approval is revoked during inference', async () => {
  let firstCalls = 0;
  let fallbackCalls = 0;
  const revoked = {
    id: 'revoked-during-call', priority: 2, capabilities: ['GENERAL'],
    estimatedCost: 0, costProvenance: verifiedFree('revoked-during-call'),
    invoke: async () => {
      firstCalls += 1;
      revoked.estimatedCost = 4;
      return 'answer must not be credited';
    },
  };
  const healthy = {
    id: 'still-free', priority: 1, capabilities: ['GENERAL'],
    estimatedCost: 0, costProvenance: verifiedFree('still-free'),
    invoke: async () => { fallbackCalls += 1; return 'authorized fallback'; },
  };
  const ai = new Augmentio({
    pool: new ProviderPool([revoked, healthy]),
    scheduler: new ParallelScheduler({ retries: 0, globalConcurrency: 2 }),
  });
  const result = await ai.fanOut({ input: 'post invocation cost guard', maxCandidates: 2 });
  assert.equal(firstCalls, 1);
  assert.equal(fallbackCalls, 1);
  assert.equal(result.candidates.length, 1);
  assert.equal(result.best.text, 'authorized fallback');
  assert.equal(result.failures, 1);
  assert.equal(ai.quota.get('revoked-during-call').calls, 1);
  assert.equal(ai.quota.get('revoked-during-call').lastStatus, null);
});

test('Augmentio fails closed and never caches responses with revoked provenance after inference', async () => {
  let invoked = 0;
  const adapter = {
    id: 'provenance-withdrawn', capabilities: ['GENERAL'],
    estimatedCost: 0, costProvenance: verifiedFree('provenance-withdrawn'),
    invoke: async () => {
      invoked += 1;
      adapter.costProvenance = null;
      return 'must not be considered a valid answer';
    },
  };
  const ai = new Augmentio({
    pool: new ProviderPool([adapter]),
    scheduler: new ParallelScheduler({ retries: 0 }),
  });
  await assert.rejects(ai.fanOut({ input: 'withdrawn local approval' }),
    error => error?.code === 'ALL_PROVIDERS_FAILED'
      && error.failures?.some(x => x.includes('ZERO_EURO_PROVENANCE_REQUIRED')));
  assert.equal(invoked, 1);
  assert.equal(ai.cache.entries.size, 0);
  assert.equal(ai.quota.get('provenance-withdrawn').calls, 1);
  assert.equal(ai.quota.get('provenance-withdrawn').lastStatus, null);
});

test('Augmentio never echoes secrets or giant untrusted metadata from a provider reply', async () => {
  const secret = 'SECRET_BEARER_TOKEN_SHOULD_NOT_LEAK';
  const pool = new ProviderPool([{
    id: 'limited-provenance', providerId: 'workers-ai', modelId: 'real-model',
    capabilities: ['GENERAL'], estimatedCost: 0,
    costProvenance: verifiedFree('limited-provenance', {provider:'workers-ai',model:'real-model'}),
    invoke: async () => ({
      text: 'concise valid answer',
      provenance: {
        provider: 'fake', model: 'forged', adapter_id: 'fake-adapter',
        source: 'actual-source',
        transport: 'https'.repeat(1000),
        api_key: secret,
        authorization: { token: secret },
        raw_response: 'x'.repeat(500_000),
        inference_settings_applied: Array(100).fill('max_tokens'),
        lora_applied: false,
        trace_id: 'trace-1',
      },
    }),
  }]);
  const ai = new Augmentio({
    pool, scheduler: new ParallelScheduler({ retries: 0 }),
  });
  const first = await ai.fanOut({ input: 'bounded metadata' });
  assert.equal(first.best.text, 'concise valid answer');
  assert.equal(first.best.provenance.provider, 'workers-ai');
  assert.equal(first.best.provenance.model, 'real-model');
  assert.equal(first.best.provenance.adapter_id, 'limited-provenance');
  assert.equal(first.best.provenance.source, 'actual-source');
  assert.equal(first.best.provenance.trace_id, 'trace-1');
  assert.equal(first.best.provenance.transport.length, 240);
  assert.equal(first.best.provenance.inference_settings_applied.length, 12);
  assert.equal(first.best.provenance.lora_applied, false);
  assert.equal(JSON.stringify(first).includes(secret), false);
  assert.ok(JSON.stringify(first).length < 2000);
  const cached = await ai.fanOut({ input: 'bounded metadata' });
  assert.equal(cached.cacheHit, true);
  assert.equal(JSON.stringify(cached).includes(secret), false);
});

test('Augmentio ignores malformed nonobject and nonserializable provenance extras', async () => {
  const pool = new ProviderPool([{
    id:'minimal', capabilities:['GENERAL'], estimatedCost:0,
    costProvenance: verifiedFree('minimal'),
    invoke: async () => ({
      text: 'good answer',
      provenance: { source: 42, transport: { nested: true },
        malicious: () => 'not serializable', region: 'EU', lora_applied: 'true' },
    }),
  }]);
  const ai = new Augmentio({ pool, scheduler: new ParallelScheduler({ retries: 0 }) });
  const result = await ai.fanOut({ input: 'malformed metadata' });
  assert.deepEqual(result.best.provenance, {
    region: 'EU', provider: 'minimal', model: 'minimal', adapter_id: 'minimal',
  });
});

test('provider deadlines remain PROVIDER_TIMEOUT when an abort-aware model rejects synchronously', async () => {
  let attempts = 0;
  const scheduler = new ParallelScheduler({
    globalConcurrency: 1, retries: 1, backoffMs: 1,
    timeoutMs: 15, circuitBreakerFailures: 5,
  });
  const settled = await scheduler.run([{ id: 'abort-aware-model' }],
    async (_task, _index, { signal }) => {
      attempts += 1;
      return new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(Object.assign(
          new Error('SCHEDULER_ABORTED'), { code: 'SCHEDULER_ABORTED' },
        )), { once: true });
      });
    });
  assert.equal(attempts, 2, 'a real provider timeout must use the configured retry');
  assert.equal(settled.length, 1);
  assert.equal(settled[0].status, 'rejected');
  assert.equal(settled[0].reason.code, 'PROVIDER_TIMEOUT',
    'child abort rejection must not masquerade as owner cancellation');
  assert.equal(scheduler.breaker('abort-aware-model').failures, 2,
    'timeout must count as a provider failure for circuit-breaker health');
});

test('parallel scheduler does not retry 401, 403 or 429 model responses', async () => {
  for (const status of [401, 403, 429]) {
    let requests = 0;
    const scheduler = new ParallelScheduler({
      retries: 4, backoffMs: 1, circuitBreakerFailures: 10,
    });
    const settled = await scheduler.run([{ id: 'restricted-model' }], async () => {
      requests += 1;
      throw Object.assign(new Error('provider refused request'), { status });
    });
    assert.equal(requests, 1, `HTTP ${status} should not be retried`);
    assert.equal(settled[0].status, 'rejected');
    assert.equal(settled[0].reason.status, status, 'preserve the original provider failure');
    assert.equal(scheduler.breaker('restricted-model').failures, 1,
      'one real refused request should count once for the circuit breaker');
  }
});

test('parallel scheduler keeps bounded retries for a genuinely transient 503', async () => {
  let requests = 0;
  const scheduler = new ParallelScheduler({
    retries: 2, backoffMs: 0, circuitBreakerFailures: 10,
  });
  const settled = await scheduler.run([{ id: 'transient-model' }], async () => {
    requests += 1;
    if (requests < 3) throw Object.assign(new Error('temporary outage'), { status: 503 });
    return 'recovered model response';
  });
  assert.equal(requests, 3);
  assert.equal(settled[0].status, 'fulfilled');
  assert.equal(settled[0].value, 'recovered model response');
});

test('zero-euro policy revocation fails once without redundant provider retries', async () => {
  let attempts = 0;
  const scheduler = new ParallelScheduler({
    retries: 5, backoffMs: 1, circuitBreakerFailures: 10,
  });
  const result = await scheduler.run([{ id: 'unauthorized-model' }], async () => {
    attempts += 1;
    throw Object.assign(new Error('ZERO_EURO_AUTHORIZATION_REQUIRED'),
      { code: 'ZERO_EURO_AUTHORIZATION_REQUIRED' });
  });
  assert.equal(attempts, 1);
  assert.equal(result[0].reason.code, 'ZERO_EURO_AUTHORIZATION_REQUIRED');
});

test('Augmentio keeps 429 cooldown and uses a healthy provider without retrying the limited model', async () => {
  let limitedCalls = 0;
  let healthyCalls = 0;
  const pool = new ProviderPool([
    { id: 'rate-limited', priority: 2, capabilities: ['GENERAL'],
      estimatedCost: 0, costProvenance: verifiedFree('rate-limited'),
      invoke: async () => {
        limitedCalls += 1;
        throw Object.assign(new Error('rate limit'), { status: 429 });
      } },
    { id: 'healthy', priority: 1, capabilities: ['GENERAL'],
      estimatedCost: 0, costProvenance: verifiedFree('healthy'),
      invoke: async () => { healthyCalls += 1; return 'healthy model answer'; } },
  ]);
  const ai = new Augmentio({
    pool, scheduler: new ParallelScheduler({
      retries: 5, backoffMs: 1, circuitBreakerFailures: 10,
    }),
  });
  const result = await ai.fanOut({ input: 'respect 429 cooldown', maxCandidates: 2 });
  assert.equal(limitedCalls, 1);
  assert.equal(healthyCalls, 1);
  assert.equal(result.best.text, 'healthy model answer');
  assert.equal(result.failures, 1);
  assert.equal(ai.quota.get('rate-limited').lastStatus, 429);
  assert.equal(ai.quota.isAvailable('rate-limited'), false);
});
