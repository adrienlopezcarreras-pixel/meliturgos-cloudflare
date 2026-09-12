import { createDefaultAugmentioPool } from '../augmentio/default-pool.js';
import { ZeroEuroGovernor } from '../augmentio/zero-euro-governor.js';
import { runStateOfPlayCouncil } from './model-council.js';

export const COUNCIL_ROLES = Object.freeze([
  Object.freeze({
    id: 'ARCHITECTURE_REUSE',
    label: 'Architecture et réutilisation',
    focus: 'Réutiliser les briques existantes, limiter les doublons, proposer le plus petit changement cohérent.'
  }),
  Object.freeze({
    id: 'SECURITY_GOVERNANCE',
    label: 'Sécurité et gouvernance',
    focus: 'Chercher les risques, permissions, secrets, coûts, régressions, rollback et comportements fail-closed.'
  }),
  Object.freeze({
    id: 'TESTS_EVIDENCE',
    label: 'Tests et preuves',
    focus: 'Définir des critères d’acceptation observables, tests ciblés, non-régression et preuves exactes.'
  }),
  Object.freeze({
    id: 'PRODUCT_INTEGRATION',
    label: 'Produit et intégration',
    focus: 'Vérifier la valeur réelle, l’intégration à la roadmap, l’UX système et les dépendances entre modules.'
  }),
  Object.freeze({
    id: 'MEMORY_AUTONOMY',
    label: 'Mémoire et autonomie',
    focus: 'Vérifier continuité, mémoire, reprise, provenance, idempotence et capacité à continuer sans duplication.'
  }),
]);

function roleFor(index) {
  return COUNCIL_ROLES[index % COUNCIL_ROLES.length];
}

function promptFor(member, brief, role) {
  return [
    'Tu participes au Council technique de MELITURGOS.',
    'Ta réponse doit être indépendante, concrète, prudente et fondée sur les éléments fournis.',
    'Ne suppose jamais qu’une capacité existe si elle n’est pas prouvée dans le contexte.',
    `RÔLE: ${role.label} (${role.id})`,
    `FOCUS: ${role.focus}`,
    'OBJECTIF:', brief.goal,
    'CONTEXTE:', JSON.stringify(brief.context || {}),
    'QUESTIONS:', ...brief.questions.map((q, i) => `${i + 1}. ${q}`),
    'Réponds avec: EXISTANT, MANQUES, OPTIONS, RISQUES, RECOMMANDATION, TESTS.',
    `MEMBRE: ${member}`
  ].join('\n');
}

function boundedText(value, max = 7000) {
  return String(value || '').trim().slice(0, max);
}

function synthesisPrompt({ goal, context, report }) {
  const independent = (report.responses || []).map((row, index) => {
    const answer = row?.answer || {};
    return {
      index: index + 1,
      member: row?.member || null,
      role: answer.role || null,
      provider: answer.provenance?.provider || answer.provider_id || null,
      model: answer.provenance?.model || null,
      content: boundedText(answer.content),
    };
  });
  return [
    'Tu es MEL, coordinatrice du Council multi-IA de MELITURGOS.',
    'Les avis ci-dessous ont été produits indépendamment. Ne les fusionne pas aveuglément.',
    'Identifie les accords, désaccords, hypothèses non prouvées et risques.',
    'Privilégie la réutilisation de l’existant, le plus petit diff réversible, les preuves et le zéro coût ajouté.',
    'N’invente aucune capacité ni aucun résultat de test.',
    'OBJECTIF:', goal,
    'CONTEXTE:', JSON.stringify(context || {}),
    'AVIS INDÉPENDANTS:', JSON.stringify(independent),
    'Produis une SYNTHÈSE MEL avec: CONSENSUS, DÉSACCORDS, DÉCISION RECOMMANDÉE, PLAN MINIMAL, TESTS, RISQUES, QUESTIONS POUR LE TEACHER.'
  ].join('\n');
}

async function synthesizeWithFallback({ eligible, goal, context, report }) {
  const attempted = [];
  const input = synthesisPrompt({ goal, context, report });
  for (const provider of eligible) {
    attempted.push(provider.id);
    try {
      const result = await provider.invoke({
        input,
        context: { purpose: 'mel-council-synthesis', coordinator: 'MEL' }
      });
      const text = boundedText(result?.text ?? result?.response ?? result, 12000);
      if (!text) continue;
      return {
        status: 'COMPLETE',
        coordinator: 'MEL',
        provider_id: provider.id,
        provenance: result?.provenance || { provider: provider.providerId, model: provider.modelId },
        text,
        attempted,
      };
    } catch {
      // Try the next already-authorized zero-cost provider. Independent Council
      // answers remain valid even if one synthesis model is temporarily down.
    }
  }
  return {
    status: 'DEGRADED',
    coordinator: 'MEL',
    provider_id: null,
    provenance: null,
    text: '',
    attempted,
  };
}

/**
 * Concrete zero-added-cost state-of-play Council backed by the configured
 * .augmentio provider pool. Unknown-cost providers are excluded fail-closed.
 * Every eligible provider is attempted independently with a specialist role;
 * MEL then synthesizes the independent answers through an eligible zero-cost
 * provider before the external Teacher gate.
 */
export async function runAugmentioStateOfPlay({ env, goal, context = {}, minResponses = 2, capability = 'GENERAL', pool } = {}) {
  const providerPool = pool || createDefaultAugmentioPool(env);
  await providerPool.refreshHealth();
  const governor = new ZeroEuroGovernor({ maxCost: 0 });
  const eligible = providerPool.list({ capability }).filter(provider => governor.allows(provider));
  if (eligible.length < minResponses) {
    const error = new Error('COUNCIL_NOT_ENOUGH_ZERO_COST_PROVIDERS');
    error.code = 'COUNCIL_NOT_ENOUGH_ZERO_COST_PROVIDERS';
    error.status = 503;
    error.eligible = eligible.map(p => p.id);
    error.required = minResponses;
    throw error;
  }

  const assignments = eligible.map((provider, index) => ({ provider, role: roleFor(index) }));
  const byId = new Map(assignments.map(row => [row.provider.id, row]));
  const councilContext = {
    ...context,
    budget_policy: 'ZERO_ADDED_COST_FAIL_CLOSED',
    council_policy: 'ALL_ELIGIBLE_PROVIDERS_ATTEMPTED_INDEPENDENTLY_THEN_MEL_SYNTHESIS',
    teacher_gate: 'EXTERNAL_CHATGPT_TEACHER_AFTER_MEL_SYNTHESIS',
    eligible_providers: assignments.map(({ provider, role }) => ({
      id: provider.id,
      provider: provider.providerId,
      model: provider.modelId,
      role: role.id,
      role_label: role.label,
    }))
  };

  const report = await runStateOfPlayCouncil({
    goal,
    context: councilContext,
    members: assignments.map(row => row.provider.id),
    minResponses,
    ask: async (member, brief) => {
      const assignment = byId.get(member);
      const provider = assignment?.provider;
      const role = assignment?.role;
      if (!provider || !role) throw Object.assign(new Error('COUNCIL_PROVIDER_NOT_FOUND'), { code: 'COUNCIL_PROVIDER_NOT_FOUND', status: 503 });
      const result = await provider.invoke({
        input: promptFor(member, brief, role),
        context: { purpose: 'state-of-play-before-development', council_role: role.id }
      });
      return {
        content: result?.text ?? String(result || ''),
        role: role.id,
        role_label: role.label,
        provenance: result?.provenance || { provider: provider.providerId, model: provider.modelId },
        provider_id: provider.id,
        estimated_cost: provider.estimatedCost
      };
    }
  });

  const succeeded = new Set((report.responses || []).map(row => row.member));
  const synthesis = await synthesizeWithFallback({ eligible, goal, context: councilContext, report });
  return {
    ...report,
    roster: assignments.map(({ provider, role }) => ({
      id: provider.id,
      provider: provider.providerId,
      model: provider.modelId,
      role: role.id,
      role_label: role.label,
      attempted: true,
      responded: succeeded.has(provider.id),
    })),
    providers_attempted: eligible.map(provider => provider.id),
    providers_succeeded: [...succeeded],
    providers_failed: (report.failures || []).map(row => row.member),
    all_eligible_attempted: true,
    synthesis,
    teacher_required: true,
    teacher_role: 'CHATGPT_EXTERNAL_ARCHITECT_REVIEWER',
    next: synthesis.status === 'COMPLETE'
      ? 'EXTERNAL_TEACHER_REVIEW_THEN_INSPECT_CODE'
      : 'EXTERNAL_TEACHER_REVIEW_WITH_DEGRADED_MEL_SYNTHESIS'
  };
}
