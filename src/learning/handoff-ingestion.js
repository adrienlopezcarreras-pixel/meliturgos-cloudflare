import { createCorrectionRecord } from './correction-corpus.js';
import { validateAgentExperience } from './agent-xp-protocol.js';

function normalizeText(value) {
  return String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function semanticKey(row = {}) {
  return [row.domain, row.task, row.after].map(normalizeText).join('|');
}

export function validateLearningHandoff(handoff = {}, { expectedSha = '' } = {}) {
  const issues = [];
  if (handoff.validated !== true) issues.push('handoff:not-validated');
  if (!String(handoff.provenance?.path || '').trim()) issues.push('provenance:path-required');
  const provenanceSha = String(handoff.provenance?.sha || '').trim();
  if (!provenanceSha) issues.push('provenance:sha-required');
  if (expectedSha && provenanceSha && provenanceSha !== String(expectedSha)) issues.push('provenance:sha-mismatch');
  const xp = handoff.experience || handoff.xp || {};
  const checked = validateAgentExperience(xp);
  issues.push(...checked.issues.map(issue => `experience:${issue}`));
  if (xp.validated !== true) issues.push('experience:not-validated');
  return { ok: issues.length === 0, issues, experience: xp };
}

export async function ingestValidatedHandoffs({ handoffs = [], learningEngine, expectedSha = '' } = {}) {
  if (!learningEngine || typeof learningEngine.corrections !== 'function' || !learningEngine.memory?.remember) {
    throw new Error('LEARNING_ENGINE_REQUIRED');
  }
  const existing = await learningEngine.corrections({ limit: null });
  const ids = new Set(existing.map(row => row?.id).filter(Boolean));
  const meanings = new Set(existing.map(semanticKey));
  const result = { accepted: [], duplicate: [], rejected: [] };

  for (const handoff of handoffs) {
    const checked = validateLearningHandoff(handoff, { expectedSha });
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
    const row = createCorrectionRecord(xp);
    await learningEngine.memory.remember({
      id: `correction:${row.id}`,
      goal: row.task || row.input,
      kind: 'TEACHER_CORRECTION',
      lesson: row.rationale,
      evidence: { ...row, handoff_provenance: provenance },
      outcome: 'SUCCEEDED',
      score: row.quality,
      tags: ['learning', 'correction', 'handoff', row.domain, ...row.tags].slice(0, 20),
      created_at: row.created_at,
    });
    ids.add(xp.id);
    meanings.add(meaning);
    result.accepted.push({ id: xp.id, provenance });
  }
  return result;
}
