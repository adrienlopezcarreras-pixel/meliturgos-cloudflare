import { createDefaultAugmentioPool } from '../augmentio/default-pool.js';
import { ZeroEuroGovernor } from '../augmentio/zero-euro-governor.js';
import { runStateOfPlayCouncil } from './model-council.js';

function promptFor(member, brief) {
  return [
    'Tu participes au Council technique de MELITURGOS.',
    'Ta réponse doit être indépendante, concrète, prudente et fondée sur les éléments fournis.',
    'Ne suppose jamais qu’une capacité existe si elle n’est pas prouvée dans le contexte.',
    'OBJECTIF:', brief.goal,
    'CONTEXTE:', JSON.stringify(brief.context || {}),
    'QUESTIONS:', ...brief.questions.map((q, i) => `${i + 1}. ${q}`),
    'Réponds avec: EXISTANT, MANQUES, OPTIONS, RISQUES, RECOMMANDATION, TESTS.',
    `MEMBRE: ${member}`
  ].join('\n');
}

/**
 * Concrete zero-added-cost state-of-play Council backed by the configured
 * .augmentio provider pool. Unknown-cost providers are excluded fail-closed.
 */
export async function runAugmentioStateOfPlay({ env, goal, context = {}, minResponses = 2, capability = 'GENERAL', pool } = {}) {
  const providerPool = pool || createDefaultAugmentioPool(env);
  await providerPool.refreshHealth();
  const governor = new ZeroEuroGovernor({ maxCost: 0 });
  const eligible = providerPool.list({ capability }).filter(provider => governor.allows(provider));
  if (eligible.length < minResponses) {
    const error = new Error('COUNCIL_NOT_ENOUGH_ZERO_COST_PROVIDERS');
    error.code = 'COUNCIL_NOT_ENOUGH_ZERO_COST_PROVIDERS';
    error.eligible = eligible.map(p => p.id);
    error.required = minResponses;
    throw error;
  }

  const byId = new Map(eligible.map(p => [p.id, p]));
  return runStateOfPlayCouncil({
    goal,
    context: {
      ...context,
      budget_policy: 'ZERO_ADDED_COST_FAIL_CLOSED',
      eligible_providers: eligible.map(p => ({ id: p.id, provider: p.providerId, model: p.modelId }))
    },
    members: eligible.map(p => p.id),
    minResponses,
    ask: async (member, brief) => {
      const provider = byId.get(member);
      if (!provider) throw Object.assign(new Error('COUNCIL_PROVIDER_NOT_FOUND'), { code: 'COUNCIL_PROVIDER_NOT_FOUND' });
      const result = await provider.invoke({
        input: promptFor(member, brief),
        context: { purpose: 'state-of-play-before-development' }
      });
      return {
        content: result?.text ?? String(result || ''),
        provenance: result?.provenance || { provider: provider.providerId, model: provider.modelId },
        provider_id: provider.id,
        estimated_cost: provider.estimatedCost
      };
    }
  });
}
