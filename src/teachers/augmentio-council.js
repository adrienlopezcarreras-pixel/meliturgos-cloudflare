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

export const REQUIRED_COUNCIL_ROLE_IDS = Object.freeze([
  'ARCHITECTURE_REUSE',
  'SECURITY_GOVERNANCE',
  'TESTS_EVIDENCE',
  'PRODUCT_INTEGRATION',
]);

const BUDGET_POLICY = 'ZERO_ADDED_COST_FAIL_CLOSED';

function roleFor(index) {
  return COUNCIL_ROLES[index % COUNCIL_ROLES.length];
}

function buildAssignments(eligible) {
  const assignments = eligible.map((provider, index) => ({
    memberId: provider.id,
    provider,
    role: roleFor(index),
    supplemental: false,
  }));
  const assignedRoles = new Set(assignments.map(row => row.role.id));
  let cursor = 0;
  for (const roleId of REQUIRED_COUNCIL_ROLE_IDS) {
    if (assignedRoles.has(roleId)) continue;
    const role = COUNCIL_ROLES.find(candidate => candidate.id === roleId);
    const provider = eligible[cursor % eligible.length];
    assignments.push({
      memberId: `${provider.id}::${role.id}`,
      provider,
      role,
      supplemental: true,
    });
    assignedRoles.add(role.id);
    cursor += 1;
  }
  return assignments;
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

function stableDigest(value) {
  const text = JSON.stringify(value);
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

function critiqueRows(report) {
  return (report?.responses || []).map((row, index) => {
    const answer = row?.answer || {};
    return Object.freeze({
      index: index + 1,
      member_id: row?.member || null,
      role: answer.role || null,
      role_label: answer.role_label || null,
      assigned_provider_id: answer.assigned_provider_id || null,
      responding_provider_id: answer.provider_id || null,
      provider_fallback_used: answer.provider_fallback_used === true,
      provider_attempts: Array.isArray(answer.provider_attempts) ? [...answer.provider_attempts] : [],
      provider: answer.provenance?.provider || null,
      model: answer.provenance?.model || null,
      content: boundedText(answer.content),
    });
  });
}

function critiqueEvidence(report) {
  const rows = critiqueRows(report);
  const assigned = [...new Set(rows.map(row => row.assigned_provider_id).filter(Boolean))];
  const responding = [...new Set(rows.map(row => row.responding_provider_id).filter(Boolean))];
  const roles = [...new Set(rows.map(row => row.role).filter(Boolean))];
  return Object.freeze({
    review_count: rows.length,
    required_role_count: REQUIRED_COUNCIL_ROLE_IDS.length,
    role_coverage: roles,
    all_required_roles_present: REQUIRED_COUNCIL_ROLE_IDS.every(role => roles.includes(role)),
    unique_assigned_providers: assigned,
    unique_responding_providers: responding,
    provider_reuse: rows.length > assigned.length,
    fallback_reviews: rows.filter(row => row.provider_fallback_used).length,
    critiques_digest: stableDigest(rows),
    critiques: Object.freeze(rows),
  });
}

function fallbackOrder(preferred, eligible) {
  return [preferred, ...eligible.filter(provider => provider.id !== preferred.id)];
}

function zeroCostProvenance(provider) {
  const provenance = provider?.costProvenance || {};
  const authorization = provenance?.authorization || {};
  return {
    provider_id: provider?.id || null,
    provider: provider?.providerId || null,
    model: provider?.modelId || null,
    verified: provenance?.verified === true,
    added_cost: Number(provenance?.addedCost),
    source: provenance?.source || null,
    authorization: {
      approved: authorization?.approved === true,
      policy: authorization?.policy || null,
      authority: authorization?.authority || null,
      adapter_id: authorization?.adapter_id || null,
      provider: authorization?.provider || null,
      model: authorization?.model || null,
    },
  };
}

async function invokeRoleWithFallback({ assignment, eligible, input, governor }) {
  const attempted = [];
  let lastError = null;
  for (const provider of fallbackOrder(assignment.provider, eligible)) {
    attempted.push(provider.id);
    try {
      governor.assertAllowed(provider);
      const result = await provider.invoke({
        input,
        context: { purpose: 'state-of-play-before-development', council_role: assignment.role.id }
      });
      return {
        content: result?.text ?? String(result || ''),
        role: assignment.role.id,
        role_label: assignment.role.label,
        provenance: result?.provenance || { provider: provider.providerId, model: provider.modelId },
        provider_id: provider.id,
        assigned_provider_id: assignment.provider.id,
        provider_fallback_used: provider.id !== assignment.provider.id,
        provider_attempts: attempted,
        member_id: assignment.memberId,
        estimated_cost: provider.estimatedCost
      };
    } catch (error) {
      lastError = error;
    }
  }
  const error = new Error('COUNCIL_ROLE_ALL_ZERO_COST_PROVIDERS_FAILED');
  error.code = 'COUNCIL_ROLE_ALL_ZERO_COST_PROVIDERS_FAILED';
  error.role = assignment.role.id;
  error.attempted = attempted;
  error.cause = lastError;
  throw error;
}

function synthesisPrompt({ goal, context, report }) {
  const independent = critiqueRows(report);
  const inputDigest = stableDigest(independent);
  return {
    inputDigest,
    text: [
    'Tu es MEL, coordinatrice du Council multi-IA de MELITURGOS.',
    'Les avis ci-dessous ont été produits indépendamment. Ne les fusionne pas aveuglément.',
    'Identifie les accords, désaccords, hypothèses non prouvées et risques.',
    'Privilégie la réutilisation de l’existant, le plus petit diff réversible, les preuves et le zéro coût ajouté.',
    'N’invente aucune capacité ni aucun résultat de test.',
    'OBJECTIF:', goal,
    'CONTEXTE:', JSON.stringify(context || {}),
    'AVIS INDÉPENDANTS:', JSON.stringify(independent),
    `CRITIQUES_DIGEST: ${inputDigest}`,
    'Produis une SYNTHÈSE MEL avec: CONSENSUS, DÉSACCORDS, DÉCISION RECOMMANDÉE, PLAN MINIMAL, TESTS, RISQUES, QUESTIONS POUR LE TEACHER.'
  ].join('\n'),
  };
}

async function synthesizeWithFallback({ eligible, goal, context, report, governor }) {
  const attempted = [];
  const prompt = synthesisPrompt({ goal, context, report });
  const input = prompt.text;
  for (const provider of eligible) {
    attempted.push(provider.id);
    try {
      governor.assertAllowed(provider);
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
        input_digest: prompt.inputDigest,
      };
    } catch {
      // Try the next provider only if it still passes the same zero-euro gate.
    }
  }
  return {
    status: 'DEGRADED',
    coordinator: 'MEL',
    provider_id: null,
    provenance: null,
    text: '',
    attempted,
    input_digest: prompt.inputDigest,
  };
}

export async function runAugmentioStateOfPlay({ env, goal, context = {}, minResponses = 2, capability = 'GENERAL', pool } = {}) {
  const providerPool = pool || createDefaultAugmentioPool(env);
  await providerPool.refreshHealth();
  const governor = new ZeroEuroGovernor();
  const eligible = providerPool.list({ capability }).filter(provider => governor.allows(provider));
  if (eligible.length < minResponses) {
    const error = new Error('COUNCIL_NOT_ENOUGH_ZERO_COST_PROVIDERS');
    error.code = 'COUNCIL_NOT_ENOUGH_ZERO_COST_PROVIDERS';
    error.status = 503;
    error.eligible = eligible.map(p => p.id);
    error.required = minResponses;
    throw error;
  }

  const assignments = buildAssignments(eligible);
  const byMember = new Map(assignments.map(row => [row.memberId, row]));
  const councilContext = {
    ...context,
    budget_policy: BUDGET_POLICY,
    council_policy: 'ALL_ELIGIBLE_PROVIDERS_AND_REQUIRED_ROLES_THEN_MEL_SYNTHESIS',
    teacher_gate: 'EXTERNAL_CHATGPT_TEACHER_AFTER_MEL_SYNTHESIS',
    required_roles: [...REQUIRED_COUNCIL_ROLE_IDS],
    eligible_providers: eligible.map(provider => ({
      id: provider.id,
      provider: provider.providerId,
      model: provider.modelId,
    })),
    role_assignments: assignments.map(({ memberId, provider, role, supplemental }) => ({
      member_id: memberId,
      provider_id: provider.id,
      provider: provider.providerId,
      model: provider.modelId,
      role: role.id,
      role_label: role.label,
      supplemental,
    }))
  };

  const report = await runStateOfPlayCouncil({
    goal,
    context: councilContext,
    members: assignments.map(row => row.memberId),
    minResponses: Math.max(minResponses, REQUIRED_COUNCIL_ROLE_IDS.length),
    ask: async (member, brief) => {
      const assignment = byMember.get(member);
      if (!assignment?.provider || !assignment?.role) {
        throw Object.assign(new Error('COUNCIL_PROVIDER_NOT_FOUND'), { code: 'COUNCIL_PROVIDER_NOT_FOUND', status: 503 });
      }
      return invokeRoleWithFallback({
        assignment,
        eligible,
        input: promptFor(member, brief, assignment.role),
        governor,
      });
    }
  });

  const succeededProviders = new Set((report.responses || []).map(row => row.answer?.provider_id).filter(Boolean));
  const succeededRoles = new Set((report.responses || []).map(row => row.answer?.role).filter(Boolean));
  const missingRequiredRoles = REQUIRED_COUNCIL_ROLE_IDS.filter(roleId => !succeededRoles.has(roleId));
  if (missingRequiredRoles.length) {
    const error = new Error('COUNCIL_REQUIRED_ROLE_RESPONSES_MISSING');
    error.code = 'COUNCIL_REQUIRED_ROLE_RESPONSES_MISSING';
    error.status = 503;
    error.missing_roles = missingRequiredRoles;
    throw error;
  }

  const critique_provenance = critiqueEvidence(report);
  const synthesis = await synthesizeWithFallback({ eligible, goal, context: councilContext, report, governor });
  if (synthesis.status !== 'COMPLETE' || !boundedText(synthesis.text, 12000)) {
    const error = new Error('COUNCIL_MEL_SYNTHESIS_REQUIRED');
    error.code = 'COUNCIL_MEL_SYNTHESIS_REQUIRED';
    error.status = 503;
    error.attempted = synthesis.attempted || [];
    throw error;
  }

  return {
    ...report,
    development_allowed: false,
    budget_policy: BUDGET_POLICY,
    zero_cost_provenance: eligible.map(zeroCostProvenance),
    roster: assignments.map(({ memberId, provider, role, supplemental }) => {
      const response = (report.responses || []).find(row => row.member === memberId);
      return {
        member_id: memberId,
        id: provider.id,
        provider: provider.providerId,
        model: provider.modelId,
        role: role.id,
        role_label: role.label,
        supplemental,
        attempted: true,
        responded: Boolean(response),
        responded_by: response?.answer?.provider_id || null,
        fallback_used: response?.answer?.provider_fallback_used === true,
      };
    }),
    providers_attempted: eligible.map(provider => provider.id),
    providers_succeeded: [...succeededProviders],
    providers_failed: eligible.map(provider => provider.id).filter(id => !succeededProviders.has(id)),
    all_eligible_attempted: eligible.every(provider => assignments.some(row => row.provider.id === provider.id)),
    required_roles_attempted: [...REQUIRED_COUNCIL_ROLE_IDS],
    required_roles_succeeded: [...succeededRoles].filter(roleId => REQUIRED_COUNCIL_ROLE_IDS.includes(roleId)),
    required_roles_missing: missingRequiredRoles,
    all_required_roles_satisfied: true,
    independent_critiques: critique_provenance.critiques,
    critique_provenance: {
      review_count: critique_provenance.review_count,
      required_role_count: critique_provenance.required_role_count,
      role_coverage: critique_provenance.role_coverage,
      all_required_roles_present: critique_provenance.all_required_roles_present,
      unique_assigned_providers: critique_provenance.unique_assigned_providers,
      unique_responding_providers: critique_provenance.unique_responding_providers,
      provider_reuse: critique_provenance.provider_reuse,
      fallback_reviews: critique_provenance.fallback_reviews,
      critiques_digest: critique_provenance.critiques_digest,
    },
    synthesis,
    council_ready_for_teacher: true,
    teacher_required: true,
    teacher_role: 'CHATGPT_EXTERNAL_ARCHITECT_REVIEWER',
    next: 'EXTERNAL_TEACHER_REVIEW_THEN_INSPECT_CODE'
  };
}
