import test from 'node:test';
import assert from 'node:assert/strict';
import { ProviderPool } from '../src/augmentio/provider-pool.js';
import { ZERO_EURO_POLICY } from '../src/augmentio/zero-euro-governor.js';
import { COUNCIL_ROLES, REQUIRED_COUNCIL_ROLE_IDS, runAugmentioStateOfPlay } from '../src/teachers/augmentio-council.js';

function verifiedFree(id) {
  return Object.freeze({
    verified: true,
    addedCost: 0,
    source: 'test-fixture-no-external-billing',
    authorization: Object.freeze({
      approved: true,
      policy: ZERO_EURO_POLICY,
      authority: 'augmentio-council-test-suite',
      adapter_id: id,
      provider: 'test',
      model: id,
    }),
  });
}

function provider(id, cost, calls, { failSynthesis = false, failRole = '', provenance = undefined } = {}) {
  return {
    id,
    providerId: 'test',
    modelId: id,
    capabilities: ['GENERAL'],
    priority: id === 'a' ? 3 : id === 'b' ? 2 : 1,
    estimatedCost: cost,
    costProvenance: provenance === undefined ? (cost === 0 ? verifiedFree(id) : null) : provenance,
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

test('state-of-play council asks every eligible authorized zero-cost provider and covers all mandatory independent roles before MEL synthesis', async () => {
  const calls = [];
  const pool = new ProviderPool([
    provider('a', 0, calls),
    provider('b', 0, calls),
    provider('c', 0, calls),
    provider('unknown', null, calls),
    provider('self-claimed', 0, calls, { provenance: { verified: true, addedCost: 0, source: 'self-claim' } }),
    provider('replayed', 0, calls, { provenance: verifiedFree('different-adapter') }),
  ]);

  const report = await runAugmentioStateOfPlay({ env: {}, goal: 'ajouter une compétence', pool, minResponses: 2 });
  assert.equal(report.status, 'COMPLETE');
  assert.equal(report.development_allowed, false);
  assert.equal(report.council_ready_for_teacher, true);
  assert.equal(report.budget_policy, 'ZERO_ADDED_COST_FAIL_CLOSED');
  assert.equal(report.zero_cost_provenance.length, 3);
  assert.deepEqual(report.zero_cost_provenance.map(row => row.provider_id), ['a', 'b', 'c']);
  assert.ok(report.zero_cost_provenance.every(row => row.verified === true && row.added_cost === 0));
  assert.ok(report.zero_cost_provenance.every(row => row.authorization.approved === true));
  assert.ok(report.zero_cost_provenance.every(row => row.authorization.policy === ZERO_EURO_POLICY));
  assert.ok(report.zero_cost_provenance.every(row => row.authorization.adapter_id === row.provider_id));
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
  assert.ok(!calls.some(row => ['unknown', 'self-claimed', 'replayed'].includes(row.id)));

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

test('mandatory role transparently falls back to another authorized zero-cost provider after a transient model failure', async () => {
  const calls = [];
  const pool = new ProviderPool([
    provider('a', 0, calls),
    provider('b', 0, calls, { failRole: 'SECURITY_GOVERNANCE' }),
  ]);
  const report = await runAugmentioStateOfPlay({ env: {}, goal: 'continuer le cycle sans perdre le rôle sécurité', pool, minResponses: 2 });
  assert.equal(report.status, 'COMPLETE');
  assert.equal(report.all_required_roles_satisfied, true);
  const security = report.responses.find(row => row.answer.role === 'SECURITY_GOVERNANCE');
  assert.ok(security);
  assert.equal(security.answer.assigned_provider_id, 'b');
  assert.equal(security.answer.provider_id, 'a');
  assert.equal(security.answer.provider_fallback_used, true);
  assert.deepEqual(security.answer.provider_attempts, ['b', 'a']);
  const securityCalls = calls.filter(row => row.purpose === 'state-of-play-before-development' && row.role === 'SECURITY_GOVERNANCE');
  assert.deepEqual(securityCalls.map(row => row.id), ['b', 'a']);
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

test('Council fails closed when no authorized zero-cost provider can produce MEL synthesis', async () => {
  const calls = [];
  const pool = new ProviderPool([
    provider('a', 0, calls, { failSynthesis: true }),
    provider('b', 0, calls, { failSynthesis: true }),
  ]);
  await assert.rejects(
    () => runAugmentioStateOfPlay({ env: {}, goal: 'ne jamais sauter la synthèse MEL', pool, minResponses: 2 }),
    error => error.code === 'COUNCIL_MEL_SYNTHESIS_REQUIRED' && Array.isArray(error.attempted) && error.attempted.length === 2
  );
});

test('council still fails closed when every authorized zero-cost provider fails the same mandatory role', async () => {
  const calls = [];
  const pool = new ProviderPool([
    provider('a', 0, calls, { failRole: 'SECURITY_GOVERNANCE' }),
    provider('b', 0, calls, { failRole: 'SECURITY_GOVERNANCE' }),
  ]);
  await assert.rejects(
    () => runAugmentioStateOfPlay({ env: {}, goal: 'x', pool, minResponses: 2 }),
    error => error.code === 'COUNCIL_INSUFFICIENT_RESPONSES' || error.code === 'COUNCIL_REQUIRED_ROLE_RESPONSES_MISSING'
  );
});

test('state-of-play council fails closed when fewer than two authorized zero-cost providers are available', async () => {
  const calls = [];
  const pool = new ProviderPool([
    provider('only', 0, calls),
    provider('unauthorized', 0, calls, { provenance: { verified: true, addedCost: 0, source: 'self-claim' } }),
  ]);
  await assert.rejects(() => runAugmentioStateOfPlay({ env: {}, goal: 'x', pool }), e => e.code === 'COUNCIL_NOT_ENOUGH_ZERO_COST_PROVIDERS');
});


test('Council exposes explicit critique provenance and binds MEL synthesis to the exact critique set', async () => {
  const calls = [];
  const pool = new ProviderPool([
    provider('a', 0, calls),
    provider('b', 0, calls),
    provider('c', 0, calls),
  ]);

  const report = await runAugmentioStateOfPlay({
    env: {},
    goal: 'documenter précisément les critiques utilisées',
    pool,
    minResponses: 2,
  });

  assert.equal(report.independent_critiques.length, REQUIRED_COUNCIL_ROLE_IDS.length);
  assert.equal(report.critique_provenance.review_count, REQUIRED_COUNCIL_ROLE_IDS.length);
  assert.equal(report.critique_provenance.required_role_count, REQUIRED_COUNCIL_ROLE_IDS.length);
  assert.equal(report.critique_provenance.all_required_roles_present, true);
  assert.deepEqual(
    new Set(report.critique_provenance.role_coverage),
    new Set(REQUIRED_COUNCIL_ROLE_IDS),
  );
  assert.deepEqual(
    new Set(report.critique_provenance.unique_assigned_providers),
    new Set(['a', 'b', 'c']),
  );
  assert.deepEqual(
    new Set(report.critique_provenance.unique_responding_providers),
    new Set(['a', 'b', 'c']),
  );
  assert.equal(report.critique_provenance.provider_reuse, true);
  assert.equal(report.critique_provenance.fallback_reviews, 0);
  assert.match(report.critique_provenance.critiques_digest, /^fnv1a-[a-f0-9]{8}$/);
  assert.equal(report.synthesis.input_digest, report.critique_provenance.critiques_digest);

  const synthesisCall = calls.find(row => row.purpose === 'mel-council-synthesis');
  assert.ok(synthesisCall);
  assert.ok(synthesisCall.input.includes(report.critique_provenance.critiques_digest));
});

test('Council provenance records fallback critics without pretending the assigned provider answered', async () => {
  const calls = [];
  const pool = new ProviderPool([
    provider('a', 0, calls),
    provider('b', 0, calls, { failRole: 'SECURITY_GOVERNANCE' }),
  ]);

  const report = await runAugmentioStateOfPlay({
    env: {},
    goal: 'prouver la provenance du fallback',
    pool,
    minResponses: 2,
  });

  const security = report.independent_critiques.find(row => row.role === 'SECURITY_GOVERNANCE');
  assert.ok(security);
  assert.equal(security.assigned_provider_id, 'b');
  assert.equal(security.responding_provider_id, 'a');
  assert.equal(security.provider_fallback_used, true);
  assert.deepEqual(security.provider_attempts, ['b', 'a']);
  assert.ok(report.critique_provenance.fallback_reviews >= 1);
  assert.deepEqual(
    new Set(report.critique_provenance.unique_responding_providers),
    new Set(['a', 'b']),
  );
});
