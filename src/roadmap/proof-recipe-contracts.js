import { ROADMAP_PROOF_SOURCES } from './roadmap-truth.js';

export const PROOF_RECIPE_REVISION = '2026-11-07-all-roadmap-proofs-v1';
export const proofRecipeMissionId = id => 'ROADMAP-PROOF-' + id;

// Instrumentation is a separate delivery. Its CI may close this auxiliary
// mission, never certify the original product objective or a physical device.
export function proofRecipeContract(id) {
  if (!String(id).startsWith('ROADMAP-PROOF-')) return null;
  const target = String(id).slice('ROADMAP-PROOF-'.length);
  const sources = ROADMAP_PROOF_SOURCES[target];
  if (!sources || !/^(?:MEL|GEN2)-[A-Z0-9-]{1,70}$/.test(target)) return null;
  return {
    title: `Rendre vérifiable ${target}`,
    mode: 'IMPLEMENT', required_proof: 'DIFF_TESTS_EXACT_SHA_CI',
    code_paths: ['src/capabilities/default-bus.js', 'src/roadmap/runtime-recertification.js', 'src/roadmap/roadmap-truth.js'],
    test_paths: [`tests/roadmap-recertification-${target.toLowerCase()}.test.mjs`],
    acceptance: [
      `Implémenter une recette auditable pour le comportement du point parent ${target}, reliée au bus canonique et aux sources de vérité du point. Exercer le vrai comportement décrit par son objectif et ses cas négatifs, pas seulement le registre ni un résultat constant. Sources actuelles : ${JSON.stringify(sources)}.`,
      'La recette est sans mutation réelle, appel payant ni action physique automatique. Une preuve externe, un matériel, un compte ou une autorisation absents doivent produire un blocage typé, jamais ok=true. Les tests de simulation ne certifient pas un appareil réel.',
      'La livraison de cette instrumentation ne valide pas le point parent : seule sa vérification réelle ultérieure, fraîche, liée au SHA déployé et à un audit SUCCEEDED, peut le rendre vert. Conserver les prérequis et refus existants.',
    ],
    revision: PROOF_RECIPE_REVISION, max_attempts: 3, verify_existing: false,
    focus_symbols: ['createDefaultCapabilityBus', 'ROADMAP_RECERTIFICATION_PROFILES'],
    verification_target_id: target,
  };
}

export function proofRecipeRoadmapItem(item) {
  const id = proofRecipeMissionId(item.id), contract = proofRecipeContract(id);
  if (!contract) return null;
  return { ...contract, id, title: `${contract.title} : ${item.title}`, status: 'PLANNED', priority: item.priority,
    phase_id: item.phase_id, phase: item.phase, depends_on: [...(item.depends_on || [])],
    contract_revision: contract.revision, proof_recipe_only: true,
    next: 'Livrer la recette et sa régression. ' + contract.acceptance.join(' ') };
}
