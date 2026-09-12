import test from 'node:test';
import assert from 'node:assert/strict';
import { ProviderPool } from '../src/augmentio/provider-pool.js';
import { COUNCIL_ROLES, runAugmentioStateOfPlay } from '../src/teachers/augmentio-council.js';

function provider(id, cost, calls, { failSynthesis = false } = {}) {
  return {
    id,
    providerId: 'test',
    modelId: id,
    capabilities: ['GENERAL'],
    priority: id === 'a' ? 3 : id === 'b' ? 2 : 1,
    estimatedCost: cost,
    enabled: true,
    healthStatus: 'HEALTHY',
    health: async () => 'HEALTHY',
    invoke: async ({ input, context = {} }) => {
      calls.push({ id, purpose: context.purpose || '', role: context.council_role || '', input });
      if (context.purpose === 'mel-council-synthesis') {
        if (failSynthesis) throw new Error('SYNTHESIS_TEMPORARY_FAILURE');
        return { text: `synthèse MEL par ${id}`, provenance: { provider: 'test', model: id } };
      }
      return { text: `diagnostic ${id}`, provenance: { provider: 'test', model: id } };
    }
  };
}

test('state-of-play council asks every eligible zero-cost provider with independent roles then MEL synthesizes', async () => {
  const calls = [];
  const pool = new ProviderPool([
    provider('a', 0, calls),
    provider('b', 0, calls),
    provider('c', 0, calls),
    provider('unknown', null, calls),
  ]);

  const report = await runAugmentioStateOfPlay({ env: {}, goal: 'ajouter une compétence', pool, minResponses: 2 });
  assert.equal(report.status, 'COMPLETE');
  assert.equal(report.development_allowed, true);
  assert.equal(report.responses.length, 3);
  assert.equal(report.roster.length, 3);
  assert.equal(report.all_eligible_attempted, true);
  assert.equal(report.teacher_required, true);
  assert.equal(report.teacher_role, 'CHATGPT_EXTERNAL_ARCHITECT_REVIEWER');
  assert.deepEqual(report.providers_attempted, ['a', 'b', 'c']);
  assert.equal(report.providers_failed.length, 0);

  const specialistCalls = calls.filter(row => row.purpose === 'state-of-play-before-development');
  assert.deepEqual(specialistCalls.map(row => row.id), ['a', 'b', 'c']);
  assert.ok(specialistCalls.every(row => row.role));
  assert.equal(new Set(specialistCalls.map(row => row.role)).size, 3);
  assert.ok(specialistCalls.every(row => row.input.includes('RÔLE:')));
  assert.ok(!calls.some(row => row.id === 'unknown'));

  const answerRoles = report.responses.map(row => row.answer.role);
  assert.equal(new Set(answerRoles).size, 3);
  assert.ok(answerRoles.every(role => COUNCIL_ROLES.some(candidate => candidate.id === role)));
  assert.equal(report.synthesis.status, 'COMPLETE');
  assert.equal(report.synthesis.coordinator, 'MEL');
  assert.equal(report.synthesis.provider_id, 'a');
  assert.match(report.synthesis.text, /synthèse MEL/);
  assert.deepEqual(report.synthesis.attempted, ['a']);
});

test('MEL synthesis falls back to another authorized zero-cost model without losing independent Council answers', async () => {
  const calls = [];
  const pool = new ProviderPool([
    provider('a', 0, calls, { failSynthesis: true }),
    provider('b', 0, calls),
  ]);
  const report = await runAugmentioStateOfPlay({ env: {}, goal: 'rendre la boucle plus robuste', pool, minResponses: 2 });
  assert.equal(report.responses.length, 2);
  assert.equal(report.synthesis.status, 'COMPLETE');
  assert.equal(report.synthesis.provider_id, 'b');
  assert.deepEqual(report.synthesis.attempted, ['a', 'b']);
});

test('state-of-play council fails closed when fewer than two zero-cost providers are available', async () => {
  const calls = [];
  const pool = new ProviderPool([provider('only', 0, calls)]);
  await assert.rejects(() => runAugmentioStateOfPlay({ env: {}, goal: 'x', pool }), e => e.code === 'COUNCIL_NOT_ENOUGH_ZERO_COST_PROVIDERS');
});
