import test from 'node:test';
import assert from 'node:assert/strict';
import { ProviderPool } from '../src/augmentio/provider-pool.js';
import { COUNCIL_ROLES, REQUIRED_COUNCIL_ROLE_IDS, runAugmentioStateOfPlay } from '../src/teachers/augmentio-council.js';

function provider(id, cost, calls, { failSynthesis = false, failRole = '' } = {}) {
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
      if (failRole && context.council_role === failRole) throw new Error('ROLE_REVIEW_FAILURE');
      return { text: `diagnostic ${id}`, provenance: { provider: 'test', model: id } };
    }
  };
}

test('state-of-play council asks every eligible zero-cost provider and covers all mandatory independent roles before MEL synthesis', async () => {
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
  assert.equal(report.responses.length, 4);
  assert.equal(report.roster.length, 4);
  assert.equal(report.all_eligible_attempted, true);
  assert.equal(report.all_required_roles_satisfied, true);
  assert.equal(report.teacher_required, true);
  assert.equal(report.teacher_role, 'CHATGPT_EXTERNAL_ARCHITECT_REVIEWER');
  assert.deepEqual(report.providers_attempted, ['a', 'b', 'c']);
  assert.deepEqual(report.providers_succeeded, ['a', 'b', 'c']);
  assert.deepEqual(report.providers_failed, []);
  assert.deepEqual(new Set(report.required_roles_succeeded), new Set(REQUIRED_COUNCIL_ROLE_IDS));
  assert.deepEqual(report.required_roles_missing, []);

  const specialistCalls = calls.filter(row => row.purpose === 'state-of-play-before-development');
  assert.deepEqual(specialistCalls.map(row => row.id), ['a', 'b', 'c', 'a']);
  assert.deepEqual(specialistCalls.map(row => row.role), REQUIRED_COUNCIL_ROLE_IDS);
  assert.ok(specialistCalls.every(row => row.input.includes('RÔLE:')));
  assert.ok(!calls.some(row => row.id === 'unknown'));

  const answerRoles = report.responses.map(row => row.answer.role);
  assert.deepEqual(answerRoles, REQUIRED_COUNCIL_ROLE_IDS);
  assert.ok(answerRoles.every(role => COUNCIL_ROLES.some(candidate => candidate.id === role)));
  assert.equal(report.synthesis.status, 'COMPLETE');
  assert.equal(report.synthesis.coordinator, 'MEL');
  assert.equal(report.synthesis.provider_id, 'a');
  assert.match(report.synthesis.text, /synthèse MEL/);
  assert.deepEqual(report.synthesis.attempted, ['a']);
});

test('two eligible models still produce four mandatory role reviews while both models are genuinely invoked', async () => {
  const calls = [];
  const pool = new ProviderPool([
    provider('a', 0, calls),
    provider('b', 0, calls),
  ]);
  const report = await runAugmentioStateOfPlay({ env: {}, goal: 'petit diff sûr', pool, minResponses: 2 });
  const specialistCalls = calls.filter(row => row.purpose === 'state-of-play-before-development');
  assert.equal(specialistCalls.length, 4);
  assert.deepEqual(specialistCalls.map(row => row.role), REQUIRED_COUNCIL_ROLE_IDS);
  assert.deepEqual(new Set(specialistCalls.map(row => row.id)), new Set(['a', 'b']));
  assert.equal(report.all_required_roles_satisfied, true);
  assert.deepEqual(report.providers_succeeded, ['a', 'b']);
});

test('MEL synthesis falls back to another authorized zero-cost model without losing independent Council answers', async () => {
  const calls = [];
  const pool = new ProviderPool([
    provider('a', 0, calls, { failSynthesis: true }),
    provider('b', 0, calls),
  ]);
  const report = await runAugmentioStateOfPlay({ env: {}, goal: 'rendre la boucle plus robuste', pool, minResponses: 2 });
  assert.equal(report.responses.length, 4);
  assert.equal(report.synthesis.status, 'COMPLETE');
  assert.equal(report.synthesis.provider_id, 'b');
  assert.deepEqual(report.synthesis.attempted, ['a', 'b']);
});

test('council fails closed when a mandatory role does not return evidence', async () => {
  const calls = [];
  const pool = new ProviderPool([
    provider('a', 0, calls),
    provider('b', 0, calls, { failRole: 'SECURITY_GOVERNANCE' }),
  ]);
  await assert.rejects(
    () => runAugmentioStateOfPlay({ env: {}, goal: 'x', pool, minResponses: 2 }),
    error => error.code === 'COUNCIL_INSUFFICIENT_RESPONSES' || error.code === 'COUNCIL_REQUIRED_ROLE_RESPONSES_MISSING'
  );
});

test('state-of-play council fails closed when fewer than two zero-cost providers are available', async () => {
  const calls = [];
  const pool = new ProviderPool([provider('only', 0, calls)]);
  await assert.rejects(() => runAugmentioStateOfPlay({ env: {}, goal: 'x', pool }), e => e.code === 'COUNCIL_NOT_ENOUGH_ZERO_COST_PROVIDERS');
});
