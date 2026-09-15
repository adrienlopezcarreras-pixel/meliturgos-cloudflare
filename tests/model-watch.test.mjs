import test from 'node:test';
import assert from 'node:assert/strict';
import { createModelWatch } from '../src/evaluation/model-watch.js';

const fixedNow = () => '2026-09-15T18:00:00.000Z';

function makeWatch({ models, allow, run }) {
  return createModelWatch({
    catalog: { discover: async () => models },
    authorization: { isAllowed: allow },
    benchmark: { run },
    now: fixedNow
  });
}

test('discovers only new explicitly authorized models', async () => {
  const watch = makeWatch({
    models: [
      { provider: 'alpha', id: 'known' },
      { provider: 'alpha', id: 'new-good' },
      { provider: 'beta', id: 'new-blocked' },
      { provider: 'alpha', id: 'new-good' },
      { provider: '', id: 'invalid' }
    ],
    allow: async (model) => model.id === 'new-good'
      ? { allowed: true, reason: 'owner_policy' }
      : { allowed: false, reason: 'provider_not_allowed' },
    run: async () => ({ score: 1 })
  });

  const report = await watch.discover({ knownModelIds: ['alpha:known'] });

  assert.deepEqual(report.candidates.map((model) => `${model.provider}:${model.id}`), ['alpha:new-good']);
  assert.equal(report.counts.discovered, 5);
  assert.equal(report.counts.newAuthorized, 1);
  assert.equal(report.rejected.length, 2);
  assert.deepEqual(report.rejected.map((item) => item.reason).sort(), [
    'invalid_model_descriptor',
    'provider_not_allowed'
  ]);
});

test('authorization errors fail closed', async () => {
  const watch = makeWatch({
    models: [{ provider: 'alpha', id: 'candidate' }],
    allow: async () => { throw new Error('policy offline'); },
    run: async () => ({ score: 1 })
  });

  const report = await watch.discover();

  assert.equal(report.candidates.length, 0);
  assert.equal(report.rejected[0].reason, 'authorization_error');
  assert.equal(report.rejected[0].error, 'policy offline');
});

test('benchmarks authorized candidates, applies thresholds and ranks passed models', async () => {
  const calls = [];
  const watch = makeWatch({
    models: [
      { provider: 'alpha', id: 'fast' },
      { provider: 'beta', id: 'slow' },
      { provider: 'gamma', id: 'best' }
    ],
    allow: async () => true,
    run: async (model, options) => {
      calls.push([model.id, options.suite]);
      if (model.id === 'fast') return { score: 0.82, latencyMs: 120, costUsd: 0, details: { cases: 12 } };
      if (model.id === 'slow') return { score: 0.95, latencyMs: 900, costUsd: 0 };
      return { score: 0.91, latencyMs: 150, costUsd: 0 };
    }
  });

  const report = await watch.run({
    suite: 'coding',
    thresholds: { minScore: 0.8, maxLatencyMs: 500, maxCostUsd: 0 }
  });

  assert.deepEqual(calls, [['fast', 'coding'], ['slow', 'coding'], ['best', 'coding']]);
  assert.deepEqual(report.results.map((item) => item.status), ['passed', 'degraded', 'passed']);
  assert.deepEqual(report.results[1].reasons, ['latency_above_threshold']);
  assert.deepEqual(report.ranked.map((item) => item.model.id), ['best', 'fast']);
  assert.equal(report.recommendation.model.id, 'best');
  assert.equal(report.watchedAt, fixedNow());
});

test('isolates benchmark failures so another candidate can still pass', async () => {
  const watch = makeWatch({
    models: [
      { provider: 'alpha', id: 'broken' },
      { provider: 'beta', id: 'working' }
    ],
    allow: async () => true,
    run: async (model) => {
      if (model.id === 'broken') throw new Error('provider timeout');
      return { score: 0.7, latencyMs: 200 };
    }
  });

  const report = await watch.run({ thresholds: { minScore: 0.5 } });

  assert.equal(report.results[0].status, 'error');
  assert.equal(report.results[0].error, 'provider timeout');
  assert.equal(report.results[1].status, 'passed');
  assert.equal(report.recommendation.model.id, 'working');
});

test('requires explicit adapters and rejects malformed catalogs', async () => {
  assert.throws(() => createModelWatch(), /catalog\.discover adapter is required/);

  const watch = createModelWatch({
    catalog: { discover: async () => ({ unexpected: [] }) },
    authorization: { isAllowed: async () => true },
    benchmark: { run: async () => ({}) },
    now: fixedNow
  });

  await assert.rejects(() => watch.discover(), /must return an array or \{ models: \[\] \}/);
});
