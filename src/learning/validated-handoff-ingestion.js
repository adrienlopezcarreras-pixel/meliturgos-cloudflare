import { validateAgentExperience } from './agent-xp-protocol.js';

function normalize(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function semanticKey(row = {}) {
  return normalize([row.domain, row.task, row.after].filter(Boolean).join(' | '));
}

export function assessValidatedHandoff(row = {}, existing = []) {
  const validation = validateAgentExperience(row);
  if (!validation.ok) return { accepted: false, reason: 'INVALID_XP', issues: validation.issues };
  if (row.validated !== true) return { accepted: false, reason: 'UNVALIDATED' };
  if (!Array.isArray(row.tests) || row.tests.length === 0) return { accepted: false, reason: 'MISSING_PROOF' };

  const rows = Array.isArray(existing) ? existing : [];
  if (rows.some((candidate) => candidate?.id === row.id)) {
    return { accepted: false, reason: 'DUPLICATE_ID', duplicate_id: row.id };
  }

  const key = semanticKey(row);
  const semanticDuplicate = rows.find((candidate) => semanticKey(candidate) === key);
  if (key && semanticDuplicate) {
    return { accepted: false, reason: 'DUPLICATE_MEANING', duplicate_id: semanticDuplicate.id || null };
  }

  return {
    accepted: true,
    reason: 'ACCEPTED',
    experience: Object.freeze({
      ...row,
      provenance: Object.freeze({
        ...(row.provenance && typeof row.provenance === 'object' ? row.provenance : {}),
        ingestion: 'validated-handoff',
      }),
    }),
  };
}

export async function ingestValidatedHandoffs({ handoffs = [], existing = [], record } = {}) {
  if (typeof record !== 'function') throw new TypeError('record function is required');
  const accepted = [];
  const rejected = [];
  const known = [...(Array.isArray(existing) ? existing : [])];

  for (const handoff of Array.isArray(handoffs) ? handoffs : []) {
    const assessment = assessValidatedHandoff(handoff, known);
    if (!assessment.accepted) {
      rejected.push({ id: handoff?.id || null, reason: assessment.reason, duplicate_id: assessment.duplicate_id || null, issues: assessment.issues || [] });
      continue;
    }
    const stored = await record(assessment.experience);
    accepted.push(stored || assessment.experience);
    known.push(assessment.experience);
  }

  return Object.freeze({ accepted, rejected, accepted_count: accepted.length, rejected_count: rejected.length });
}
