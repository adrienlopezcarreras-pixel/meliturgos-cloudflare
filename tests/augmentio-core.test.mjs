import test from 'node:test';
import assert from 'node:assert/strict';
import { ProviderPool } from '../src/augmentio/provider-pool.js';
import { ZeroEuroGovernor } from '../src/augmentio/zero-euro-governor.js';
import { ParallelScheduler } from '../src/augmentio/parallel-scheduler.js';
import { ResultTournament } from '../src/augmentio/result-tournament.js';
import { Augmentio } from '../src/augmentio/augmentio.js';

test('zero euro governor blocks paid and unknown-cost routes', () => {
  const governor = new ZeroEuroGovernor();
  assert.equal(governor.allows({ estimatedCost: 0 }), true);
  assert.equal(governor.allows({ cost: 0 }), true);
  assert.equal(governor.allows({ estimatedCost: 0.01 }), false);
  assert.equal(governor.allows({ estimatedCost: null }), false);
  assert.equal(governor.allows({ cost: null }), false);
  assert.equal(governor.allows({}), false);
  assert.equal(governor.allows({ estimatedCost: Number.NaN }), false);
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

test('augmentio fans out, tolerates failure, ranks, caches, and skips paid or unknown-cost providers', async () => {
  let calls = 0;
  const pool = new ProviderPool([
    { id: 'fast', capabilities: ['GENERAL'], priority: 3, estimatedCost: 0, invoke: async () => { calls++; return { text: 'candidate A', confidence: 0.4 }; } },
    { id: 'tested', capabilities: ['GENERAL'], priority: 2, estimatedCost: 0, invoke: async () => { calls++; return { text: 'candidate B', confidence: 0.5, testsPassed: true, provenance: { source: 'test' } }; } },
    { id: 'paid', capabilities: ['GENERAL'], priority: 99, estimatedCost: 1, invoke: async () => { calls++; return 'should not run'; } },
    { id: 'unknown-cost', capabilities: ['GENERAL'], priority: 98, invoke: async () => { calls++; return 'should not run'; } },
    { id: 'broken', capabilities: ['GENERAL'], priority: 1, estimatedCost: 0, invoke: async () => { calls++; throw new Error('boom'); } },
  ]);
  const augmentio = new Augmentio({ pool, scheduler: new ParallelScheduler({ globalConcurrency: 4 }) });
  const first = await augmentio.fanOut({ input: 'solve this', maxCandidates: 5 });
  assert.equal(first.best.provider, 'tested');
  assert.equal(first.failures, 1);
  assert.equal(calls, 3, 'paid and unknown-cost providers should be skipped');
  const second = await augmentio.fanOut({ input: 'solve this', maxCandidates: 5 });
  assert.equal(second.cacheHit, true);
  assert.equal(calls, 3, 'cache should prevent repeat calls');
});
