import { createCorrectionRecord } from './correction-corpus.js';
import { validateAgentExperience } from './agent-xp-protocol.js';

function normalizeText(value) {
  return String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function semanticKey(row = {}) {
  return [row.domain, row.task, row.after].map(normalizeText).join('|');
}

export function validateLearningHandoff(handoff = {}) {
  const issues = [];
  if (handoff.validated !== true) issues.push('handoff:not-validated');
  if (!String(handoff.provenance?.path || '').trim()) issues.push('provenance:path-required');
  if (!String(handoff.provenance?.sha || '').trim()) issues.push('provenance:sha-required');
  const xp = handoff.experience || handoff.xp || {};
  const checked = validateAgentExperience(xp);
  issues.push(...checked.issues.map(issue => `experience:${issue}`));
  if (xp.validated !== true) issues.push('experience:not-validated');
  return { ok: issues.length === 0, issues, experience: xp };
}

export async function ingestValidatedHandoffs({ handoffs = [], learningEngine } = {}) {
  if (!learningEngine || typeof learningEngine.recordCorrection !== 'function' || typeof learningEngine.corrections !== 'function') {
    throw new Error('LEARNING_ENGINE_REQUIRED');
  }
  const existing = await learningEngine.corrections({ limit: null });
  const ids = new Set(existing.map(row => row?.id).filter(Boolean));
  const meanings = new Set(existing.map(semanticKey));
  const result = { accepted: [], duplicate: [], rejected: [] };

  for (const handoff of handoffs) {
    const checked = validateLearningHandoff(handoff);
    if (!checked.ok) {
      result.rejected.push({ id: checked.experience?.id || null, issues: checked.issues });
      continue;
    }
    const xp = checked.experience;
    const meaning = semanticKey(xp);
    if (ids.has(xp.id) || meanings.has(meaning)) {
      result.duplicate.push({ id: xp.id, reason: ids.has(xp.id) ? 'ID' : 'SEMANTIC' });
      continue;
    }
    const provenance = Object.freeze({
      path: String(handoff.provenance.path),
      sha: String(handoff.provenance.sha),
      commit: handoff.provenance.commit ? String(handoff.provenance.commit) : null,
    });
    const row = createCorrectionRecord({ ...xp, metadata: { ...(xp.metadata || {}), handoff_provenance: provenance } });
    await learningEngine.recordCorrection({ ...row, handoff_provenance: provenance });
    ids.add(xp.id);
    meanings.add(meaning);
    result.accepted.push({ id: xp.id, provenance });
  }
  return result;
}
