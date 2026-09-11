import test from 'node:test';
import assert from 'node:assert/strict';
import {
  UNIFIED_DEVELOPMENT_POLICY,
  normalizeDevelopmentObjective,
  canonicalDevelopmentJobId,
  canonicalizeImplementationFanout,
} from '../src/evolution/unified-development-policy.js';
import { runStateOfPlayCouncil, requireStateOfPlayCouncil } from '../src/teachers/model-council.js';

test('same objective normalizes to same canonical text', () => {
  assert.equal(
    normalizeDevelopmentObjective('  Ajouter   la mémoire continue  '),
    normalizeDevelopmentObjective('AJOUTER la mémoire continue')
  );
});

test('canonical development job id does not depend on conversation or provider', async () => {
  const a = await canonicalDevelopmentJobId('Ajouter la mémoire continue');
  const b = await canonicalDevelopmentJobId('  AJOUTER   la mémoire continue  ');
  assert.equal(a, b);
  assert.match(a, /^owner-goal-[a-f0-9]{32}$/);
});

test('fanout persists one selected plan and discards alternative plan bodies', () => {
  const result = canonicalizeImplementationFanout({
    providersAttempted: ['a', 'b'],
    best: { provider: 'a', model: 'm1', text: 'plan canonique' },
    candidates: [
      { provider: 'a', model: 'm1', text: 'plan canonique' },
      { provider: 'b', model: 'm2', text: 'plan alternatif qui ne doit pas être persisté' },
    ],
  });
  assert.equal(result.persistence, 'ONE_SELECTED_PLAN_ONLY');
  assert.equal(result.selected.text, 'plan canonique');
  assert.equal(result.discarded_alternative_count, 1);
  assert.equal('alternatives' in result, false);
});

test('council is advisory and requires one canonical synthesis', async () => {
  const report = await runStateOfPlayCouncil({
    goal: 'Mettre à jour la mémoire',
    members: ['ia-a', 'ia-b'],
    ask: async (member) => ({ content: `avis ${member}` }),
  });
  assert.equal(report.persistence_policy.council_outputs, 'EVIDENCE_ONLY');
  assert.equal(report.persistence_policy.persistent_implementation_plans, 1);
  assert.equal(report.persistence_policy.parallel_implementations_allowed, false);
  assert.equal(report.persistence_policy.provider_direct_writes_allowed, false);
  assert.equal(requireStateOfPlayCouncil(report), report);
});

test('global policy forbids permanent parallel implementations', () => {
  assert.equal(UNIFIED_DEVELOPMENT_POLICY.mode, 'SINGLE_CANONICAL_WRITER');
  assert.equal(UNIFIED_DEVELOPMENT_POLICY.parallel_implementations_allowed, false);
  assert.equal(UNIFIED_DEVELOPMENT_POLICY.alternative_provider_outputs_persisted, false);
  assert.equal(UNIFIED_DEVELOPMENT_POLICY.persistent_implementation_plans_per_goal, 1);
});
