import test from 'node:test';
import assert from 'node:assert/strict';
import { ProviderPool } from '../src/augmentio/provider-pool.js';
import { runAugmentioStateOfPlay } from '../src/teachers/augmentio-council.js';

test('state-of-play council asks at least two explicitly zero-cost providers before development', async () => {
  const called = [];
  const provider = (id, cost) => ({
    id, providerId: 'test', modelId: id, capabilities: ['GENERAL'], priority: 1,
    estimatedCost: cost, enabled: true, healthStatus: 'HEALTHY',
    health: async () => 'HEALTHY',
    invoke: async ({ input }) => { called.push(id); return { text: 'diagnostic '+id+' '+input.slice(0,20), provenance: { provider: 'test', model: id } }; }
  });
  const pool = new ProviderPool([provider('a', 0), provider('b', 0), provider('unknown', null)]);
  const report = await runAugmentioStateOfPlay({ env: {}, goal: 'ajouter une compétence', pool, minResponses: 2 });
  assert.equal(report.status, 'COMPLETE');
  assert.equal(report.development_allowed, true);
  assert.equal(report.responses.length, 2);
  assert.deepEqual(called.sort(), ['a','b']);
  assert.match(JSON.stringify(report.responses), /diagnostic/);
});

test('state-of-play council fails closed when fewer than two zero-cost providers are available', async () => {
  const pool = new ProviderPool([{ id: 'only', providerId: 'test', modelId: 'only', capabilities: ['GENERAL'], estimatedCost: 0, healthStatus: 'HEALTHY', enabled: true, invoke: async () => ({ text: 'x' }) }]);
  await assert.rejects(() => runAugmentioStateOfPlay({ env: {}, goal: 'x', pool }), e => e.code === 'COUNCIL_NOT_ENOUGH_ZERO_COST_PROVIDERS');
});
