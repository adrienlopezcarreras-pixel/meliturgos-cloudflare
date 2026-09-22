import { validateAgentExperience } from './agent-xp-protocol.js';

function normalizeMeaning(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function semanticKey(row = {}) {
  return [row.domain, row.task, row.after]
    .map(normalizeMeaning)
    .filter(Boolean)
    .join('|');
}

function provenanceOf(handoff = {}) {
  return {
    kind: 'validated_handoff',
    handoff_id: String(handoff.id || ''),
    source_path: String(handoff.source_path || ''),
    source_sha: String(handoff.source_sha || ''),
    validated_at: Number(handoff.validated_at || 0),
  };
}

export function validateHandoffEnvelope(handoff = {}) {
  const issues = [];
  if (handoff.validated !== true) issues.push('handoff:not-validated');
  if (!String(handoff.id || '').trim()) issues.push('handoff:id-required');
  if (!String(handoff.source_path || '').trim()) issues.push('handoff:source-path-required');
  if (!/^[0-9a-f]{7,40}$/i.test(String(handoff.source_sha || ''))) issues.push('handoff:source-sha-required');
  if (!Number.isFinite(Number(handoff.validated_at)) || Number(handoff.validated_at) <= 0) issues.push('handoff:validated-at-required');
  if (!Array.isArray(handoff.experiences) || handoff.experiences.length === 0) issues.push('handoff:experiences-required');
  return { ok: issues.length === 0, issues };
}

export function ingestValidatedHandoff(handoff = {}, existing = []) {
  const envelope = validateHandoffEnvelope(handoff);
  if (!envelope.ok) return { accepted: [], skipped: [], rejected: envelope.issues, provenance: provenanceOf(handoff) };

  const byId = new Set(existing.map((row) => row?.id).filter(Boolean));
  const byMeaning = new Set(existing.map(semanticKey).filter(Boolean));
  const accepted = [];
  const skipped = [];
  const provenance = provenanceOf(handoff);

  for (const raw of handoff.experiences) {
    const row = { ...raw, provenance };
    const checked = validateAgentExperience(row);
    if (!checked.ok || row.validated !== true) {
      skipped.push({ id: row.id || null, reason: checked.ok ? 'experience:not-validated' : checked.issues.join(',') });
      continue;
    }
    const meaning = semanticKey(row);
    if (byId.has(row.id)) {
      skipped.push({ id: row.id, reason: 'duplicate:id' });
      continue;
    }
    if (meaning && byMeaning.has(meaning)) {
      skipped.push({ id: row.id, reason: 'duplicate:meaning' });
      continue;
    }
    byId.add(row.id);
    if (meaning) byMeaning.add(meaning);
    accepted.push(Object.freeze(row));
  }

  return { accepted, skipped, rejected: [], provenance };
}

export async function persistValidatedHandoff({ learningEngine, handoff, existing = null } = {}) {
  if (!learningEngine || typeof learningEngine.recordCorrection !== 'function') {
    throw new Error('LEARNING_ENGINE_REQUIRED');
  }
  const current = Array.isArray(existing)
    ? existing
    : await learningEngine.corrections({ limit: null, includeBootstrap: true });
  const result = ingestValidatedHandoff(handoff, current);
  for (const row of result.accepted) {
    await learningEngine.recordCorrection({
      ...row,
      source: `handoff:${result.provenance.handoff_id}`,
      metadata: { provenance: result.provenance },
    });
  }
  return result;
}
