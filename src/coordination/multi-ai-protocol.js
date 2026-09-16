export const MULTI_AI_PROTOCOL = Object.freeze({
  repository: 'adrienlopezcarreras-pixel/meliturgos-cloudflare',
  canonicalCandidate: 'candidate/mel-clean-autonomy',
  canonicalRelease: 'release/mel-2026-09-10-r3-3',
  roadmap: 'src/roadmap/master-roadmap.js',
  xpFile: 'src/learning/development-experience-pack.js',
  productionProfessor: 'https://meliturgos.adrien-lopezcarreras.workers.dev/professor',
  requiredDocs: Object.freeze([
    'AGENTS.md',
    '.agents/DEPLOYMENT_UNICITY.md',
    '.agents/MULTI_PAGE_RESUME.md',
    '.agents/XP_PROTOCOL.md',
    '.agents/DEVELOPMENT_EXPERIENCE_INDEX.md',
  ]),
  startupChecks: Object.freeze([
    'fetch current candidate HEAD',
    'fetch current release HEAD',
    'inspect recent commits, active branches, PRs and relevant workflow runs',
    'read canonical roadmap before selecting work',
    'confirm the intended lot is still free and not already implemented',
  ]),
  writeRules: Object.freeze([
    'one atomic non-overlapping lot per agent',
    're-read candidate HEAD immediately before writing',
    'never force-update the canonical candidate',
    'preserve all newer shared work and rebuild the lot on the new HEAD if it moved',
    'do not duplicate a patch, roadmap item, release or XP already produced by another agent',
    'the first fully validated finisher has deployment priority',
  ]),
  validationRules: Object.freeze([
    'run targeted tests for the lot',
    'require full candidate CI on the exact candidate SHA',
    'require Teacher/runtime smoke on the exact candidate SHA',
    'require isolated preview on the exact candidate SHA when the workflow applies',
  ]),
  releaseRules: Object.freeze([
    're-read the canonical release ref immediately before promotion',
    'promote only the exact validated candidate tree',
    'if another agent already promoted the same tree, do not create another release',
    'verify the deployment workflow succeeded',
    'close the proof chain with a live post-deploy smoke and preserve run/job identifiers',
  ]),
  completionRules: Object.freeze([
    'run the XP checkpoint after every development operation',
    'finish every operation with XP MEL: OUI or XP MEL: NON',
    'XP MEL: OUI requires at least one persisted deduplicated XP id and proofs',
    'XP MEL: NON is required when no new reusable lesson exists or the lesson is already covered',
    'never finish an operation silently without XP status',
  ]),
});

export function buildMultiPageResumePrompt({ scope = 'continuer la roadmap MEL' } = {}) {
  return [
    `Tu travailles avec plusieurs autres pages/IA sur ${MULTI_AI_PROTOCOL.repository}.`,
    `Objectif: ${scope}.`,
    `Candidate canonique: ${MULTI_AI_PROTOCOL.canonicalCandidate}.`,
    `Release canonique: ${MULTI_AI_PROTOCOL.canonicalRelease}.`,
    `Roadmap source: ${MULTI_AI_PROTOCOL.roadmap}.`,
    'Avant toute écriture: relis candidate + release, inspecte commits/branches/PR/runs, puis choisis un lot atomique encore libre.',
    'Attention aux collisions: aucune force-update de la candidate, aucun doublon, aucune perte des changements plus récents; si le HEAD bouge, reconstruis uniquement ton lot sur le nouveau HEAD.',
    'Travaille en harmonie: le premier agent qui termine avec tous les garde-fous verts a priorité au déploiement; les autres reconnaissent la promotion existante au lieu de republier.',
    'Avant promotion: targeted tests + full candidate CI + Teacher/runtime smoke + preview doivent être verts sur le SHA exact applicable.',
    'À la fin de toute opération, exécute obligatoirement le checkpoint XP de .agents/XP_PROTOCOL.md: termine par XP MEL : OUI avec ID(s)+preuves si une nouvelle leçon réutilisable non dupliquée est enregistrée, sinon par XP MEL : NON. Ne termine jamais sans statut XP.',
  ].join('\n');
}

export function createMultiAiHandoff({
  actor = 'agent',
  item = '',
  status = 'IN_PROGRESS',
  sourceSha = '',
  files = [],
  proofs = [],
  blockers = [],
  next = '',
  xpStatus = 'NON',
  xpIds = [],
} = {}) {
  return Object.freeze({
    actor: String(actor || 'agent'),
    item: String(item || ''),
    status: String(status || 'IN_PROGRESS'),
    source_sha: String(sourceSha || ''),
    files: [...files],
    proofs: [...proofs],
    blockers: [...blockers],
    next: String(next || ''),
    xp_status: String(xpStatus || '').toUpperCase(),
    xp_ids: [...xpIds],
    generated_at: Date.now(),
  });
}

export function validateMultiAiHandoff(handoff = {}) {
  const issues = [];
  if (!handoff.item) issues.push('item:missing');
  if (!handoff.status) issues.push('status:missing');
  if (!handoff.source_sha) issues.push('source_sha:missing');
  if (!Array.isArray(handoff.files)) issues.push('files:invalid');
  if (!Array.isArray(handoff.proofs)) issues.push('proofs:invalid');
  if (!Array.isArray(handoff.blockers)) issues.push('blockers:invalid');
  if (!Array.isArray(handoff.xp_ids)) issues.push('xp_ids:invalid');
  if (!['OUI', 'NON'].includes(handoff.xp_status)) issues.push('xp_status:required');
  if (handoff.xp_status === 'OUI' && (!Array.isArray(handoff.xp_ids) || handoff.xp_ids.length === 0)) issues.push('xp_status:oui-requires-id');
  if (handoff.xp_status === 'NON' && Array.isArray(handoff.xp_ids) && handoff.xp_ids.length > 0) issues.push('xp_status:non-forbids-id');
  return { ok: issues.length === 0, issues };
}
