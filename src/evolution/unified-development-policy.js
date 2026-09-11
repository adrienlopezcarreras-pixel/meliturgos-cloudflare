export const UNIFIED_DEVELOPMENT_POLICY = Object.freeze({
  schema: 'mel.unified-development-policy',
  version: 2,
  mode: 'SINGLE_CANONICAL_WRITER',
  council_outputs: 'ADVISORY_EVIDENCE_ONLY',
  consensus_mode: 'SEEK_CONSENSUS_THEN_TEACHER_ARBITRATION',
  consensus_required_before_persistence: true,
  final_authority: 'CHATGPT_TEACHER',
  final_authority_temporary: true,
  persistent_implementation_plans_per_goal: 1,
  active_candidate_branches_per_goal: 1,
  parallel_implementations_allowed: false,
  provider_direct_writes_allowed: false,
  alternative_provider_outputs_persisted: false,
  rules: Object.freeze([
    'Les IA du Council donnent uniquement des avis temporaires et indépendants.',
    'Elles doivent chercher un accord commun sur l’état de l’existant, les risques, la stratégie et les tests.',
    'Si elles divergent, MEL consolide explicitement les points d’accord et de désaccord au lieu de créer plusieurs versions.',
    'Tant que la gouvernance actuelle est en vigueur, ChatGPT Teacher tranche les désaccords résiduels et a le dernier mot avant toute implémentation persistante.',
    'Une décision du Teacher produit une seule décision canonique ; elle ne crée jamais une branche concurrente.',
    'Un avis de provider ne crée jamais directement un fichier, une branche, un module, un job ou un déploiement.',
    'Tous les avis convergent vers un unique travail canonique et un unique plan retenu.',
    'Avant toute modification, inspecter et réutiliser le code existant au lieu de créer une version parallèle.',
    'Une même intention de développement doit réutiliser le même job canonique, même si elle est demandée depuis une autre conversation.',
    'Une seule branche candidate autorisée est utilisée pour le changement canonique; aucune branche alternative par provider.',
    'Les réponses alternatives peuvent exister en mémoire de calcul pendant le fan-out mais ne sont pas conservées comme implémentations concurrentes.',
    'Le passage en production reste séparé, testé et explicitement contrôlé.'
  ])
});

export function normalizeDevelopmentObjective(value) {
  return String(value || '')
    .normalize('NFKC')
    .trim()
    .toLowerCase()
    .replace(/[’‘`]/g, "'")
    .replace(/\s+/g, ' ');
}

async function sha256(value) {
  const bytes = new TextEncoder().encode(String(value));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Canonical id deliberately excludes conversation id and message/request id.
 * Those values are provenance only. The same development objective therefore
 * cannot become permanent duplicate jobs merely because several chats or AIs
 * mention it independently.
 */
export async function canonicalDevelopmentJobId(goal, {
  repository = 'adrienlopezcarreras-pixel/meliturgos-cloudflare',
  roadmapId = '',
} = {}) {
  const objective = normalizeDevelopmentObjective(goal);
  if (!objective) throw Object.assign(new Error('DEVELOPMENT_GOAL_REQUIRED'), { code: 'DEVELOPMENT_GOAL_REQUIRED' });
  const scope = [String(repository || '').trim().toLowerCase(), String(roadmapId || '').trim().toUpperCase(), objective].join('\n');
  const digest = await sha256(scope);
  return `owner-goal-${digest.slice(0, 32)}`;
}

/** Persist only one selected plan; never persist alternative provider plans. */
export function canonicalizeImplementationFanout(fanout = {}) {
  const attempted = Array.isArray(fanout.providersAttempted) ? [...new Set(fanout.providersAttempted.map(String))] : [];
  const candidates = Array.isArray(fanout.candidates) ? fanout.candidates : [];
  const best = fanout.best || candidates[0] || null;
  if (!best?.text) throw Object.assign(new Error('IMPLEMENTATION_PROPOSAL_EMPTY'), { code: 'IMPLEMENTATION_PROPOSAL_EMPTY' });
  return {
    providers_attempted: attempted.slice(0, 8),
    selected: {
      provider: String(best.provider || ''),
      model: String(best.model || ''),
      text: String(best.text || ''),
    },
    discarded_alternative_count: Math.max(0, candidates.length - 1),
    persistence: 'ONE_SELECTED_PLAN_ONLY',
    consensus_mode: UNIFIED_DEVELOPMENT_POLICY.consensus_mode,
    final_authority: UNIFIED_DEVELOPMENT_POLICY.final_authority,
  };
}

export function buildUnifiedDevelopmentInstruction() {
  return [
    'RÈGLE DE DÉVELOPPEMENT UNIFIÉE:',
    'Les autres IA sont des conseillères, jamais des écrivains concurrents.',
    'Elles doivent chercher un consensus technique avant toute modification persistante.',
    'Leurs réponses sont temporaires et servent uniquement à vérifier, critiquer ou proposer.',
    'En cas de désaccord, synthétise les accords et divergences puis soumets-les au Teacher.',
    'Pour le moment, ChatGPT Teacher est l’autorité finale et tranche avant toute implémentation durable.',
    'Ne crée jamais une version alternative permanente pour chaque IA.',
    'Réutilise le job canonique, le code existant et la branche candidate canonique.',
    'À la fin du Council, conserve un seul plan consolidé puis applique un seul diff testé.',
    'Si une autre IA propose une autre architecture, traite-la comme un avis à comparer, pas comme un nouveau module à conserver.'
  ].join(' ');
}
