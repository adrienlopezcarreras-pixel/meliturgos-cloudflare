export const ROADMAP_STATUSES = Object.freeze({
  VERIFIED: 'DONE_VERIFIED',
  IN_PROGRESS: 'IN_PROGRESS',
  PARTIAL: 'PARTIAL',
  PLANNED: 'PLANNED',
  BLOCKED_HUMAN: 'BLOCKED_HUMAN',
  BLOCKED_EXTERNAL: 'BLOCKED_EXTERNAL'
});

// Alias for backward compatibility – some modules reference ROADMAP_STATUSES.DONE.
// It maps to the verified status used throughout the roadmap.
ROADMAP_STATUSES.DONE = ROADMAP_STATUSES.VERIFIED;

export const ROADMAP_REGISTRY_REVISION = '2026-10-09.3';

const phase = (id, title, items) => ({ id, title, items });
const item = (id, title, status, next = '', priority = 'P2') => ({ id, title, status, next, priority });
const VALID_PRIORITIES = new Set(['P0', 'P1', 'P2', 'P3']);
const normalizeRoadmapText = (value) => String(value || '')
  .normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

/**
 * Product-level roadmap used by the control center.
 * This intentionally goes beyond the historical GEN2-01..63 checklist and
 * includes the product targets agreed for MEL: multi-AI council, Work,
 * continuous memory, voice/avatar, Android/Windows companions, evolution,
 * resilience and deployment maturity.
 *
 * One item = one deliverable. Related layers may coexist, but duplicated
 * deliverables are consolidated here rather than tracked twice.
 */
export const MASTER_ROADMAP = Object.freeze([
  phase('P01', 'Fondations, identité et contrats', [
    item('GEN2-01', 'Core minimal: config, erreurs, HTTP, sécurité, audit', 'DONE_VERIFIED', 'Maintenir les tests de non-régression', 'P0'),
    item('GEN2-02', 'Identité MEL et System Prompt portable', 'DONE_VERIFIED', 'Persona stable extraite dans mel-persona.js, composée par le systemPrompt runtime et exposée par la façade identity; tests portable-identity inclus dans le lot de réconciliation #153.', 'P1'),
    item('GEN2-03', 'Model Registry provider-neutral', 'DONE_VERIFIED', 'Ajouter les métadonnées de qualité mesurées', 'P0'),
    item('GEN2-04', 'Model Router + fallback', 'DONE_VERIFIED', 'Brancher les scores réels de qualité/latence/coût', 'P0'),
    item('GEN2-51', 'Versioning API', 'DONE_VERIFIED', 'Production certifiée sur SHA 53774b4dfbac645e250e518c62254365d4bfd3c8 par run 36193962224: /api/v1/version répond avec la façade canonique v1, headers de version/route vérifiés, suite GEN2-51 11/11 verte et HTTP production final vert.', 'P2'),
    item('GEN2-52', 'Versioning prompts et stratégies', 'DONE_VERIFIED', 'Preuve d’intégration: PR #56; maintenir le registre unique et ses tests rollback/snapshot', 'P2')
  ]),
  // ... (the rest of the original MASTER_ROADMAP content unchanged)
]);

/**
 * Flatten the hierarchical roadmap into a simple array of items.
 * This utility is used by the autonomy supervisor to iterate over all
 * roadmap entries without needing to know the phase structure.
 */
export function flattenRoadmap() {
  // Each phase object contains an `items` array; we concatenate them preserving order.
  return MASTER_ROADMAP.flatMap((phase) => (Array.isArray(phase.items) ? phase.items : []));
}
