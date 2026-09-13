import { requireValue } from '../core/contracts.js';

const MAX_PROVENANCE_VALUES = 32;

export function normalizeMemoryContent(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .replace(/\s+/gu, ' ')
    .trim();
}

export function canonicalMemoryKey(value, kind = 'fact') {
  const content = normalizeMemoryContent(value);
  requireValue(content.length > 0, 'MEMORY_CONTENT_REQUIRED', 400);
  return `${String(kind || 'fact').trim().toLocaleLowerCase('fr-FR')}\u0000${content.toLocaleLowerCase('fr-FR')}`;
}

function validateConfidence(value) {
  const confidence = Number(value);
  requireValue(Number.isFinite(confidence) && confidence >= 0 && confidence <= 1, 'MEMORY_CONFIDENCE_INVALID', 400);
  return confidence;
}

function uniqueValues(rows, key) {
  return [...new Set(rows.map(row => String(row?.[key] ?? '').trim()).filter(Boolean))].slice(0, MAX_PROVENANCE_VALUES);
}

function candidateKind(row) {
  return String(row?.kind || row?.role || 'fact').trim() || 'fact';
}

function candidateProvenance(rows) {
  return Object.freeze({
    version: 1,
    compiler: 'mel-memory-compiler',
    candidate_ids: uniqueValues(rows, 'id'),
    conversation_ids: uniqueValues(rows, 'conversation_id'),
    message_ids: uniqueValues(rows, 'message_id'),
    sources: uniqueValues(rows, 'source'),
    observations: rows.length,
  });
}

function normalizedExisting(rows = []) {
  return (Array.isArray(rows) ? rows : [])
    .filter(row => row && row.content != null)
    .map(row => ({
      row,
      key: canonicalMemoryKey(row.content, candidateKind(row)),
    }));
}

/**
 * Compile pending observations into deterministic, deduplicated memory proposals.
 *
 * Safety properties:
 * - exact canonical duplicates collapse into one proposal;
 * - confidence never increases merely because a fact was repeated;
 * - every proposal carries bounded source provenance;
 * - an already-existing memory produces a reuse decision, not another write;
 * - this function never confirms, persists, supersedes or deletes memory.
 */
export function compileMemoryCandidates({ candidates = [], existingMemories = [] } = {}) {
  requireValue(Array.isArray(candidates), 'MEMORY_CANDIDATES_REQUIRED', 400);
  requireValue(Array.isArray(existingMemories), 'MEMORY_EXISTING_REQUIRED', 400);

  const groups = new Map();
  const rejected = [];

  for (const row of candidates) {
    try {
      const content = normalizeMemoryContent(row?.content);
      const kind = candidateKind(row);
      const confidence = validateConfidence(row?.confidence ?? 0.5);
      const key = canonicalMemoryKey(content, kind);
      const entry = { ...row, content, kind, confidence };
      const group = groups.get(key) || [];
      group.push(entry);
      groups.set(key, group);
    } catch (error) {
      rejected.push({
        id: row?.id ?? null,
        code: error?.code || error?.message || 'MEMORY_CANDIDATE_INVALID',
      });
    }
  }

  const existing = normalizedExisting(existingMemories);
  const proposals = [];

  for (const [key, rows] of groups) {
    rows.sort((a, b) => Number(a.created_at || 0) - Number(b.created_at || 0));
    const strongestConfidence = Math.max(...rows.map(row => row.confidence));
    const strongest = rows.reduce((best, row) => row.confidence > best.confidence ? row : best, rows[0]);
    const duplicate = existing.find(item => item.key === key)?.row || null;
    const provenance = candidateProvenance(rows);

    proposals.push({
      action: duplicate ? 'REUSE_EXISTING' : 'PROPOSE_MEMORY',
      existing_memory_id: duplicate?.id ?? null,
      content: strongest.content,
      kind: strongest.kind,
      confidence: strongestConfidence,
      confidence_policy: 'MAX_OBSERVED_NO_DUPLICATE_BOOST',
      provenance,
      duplicate_count: Math.max(0, rows.length - 1),
      candidate_ids: provenance.candidate_ids,
      canonical_key: key,
    });
  }

  return {
    proposals,
    rejected,
    input_count: candidates.length,
    proposal_count: proposals.length,
    rejected_count: rejected.length,
    deduplicated_count: Math.max(0, candidates.length - rejected.length - proposals.length),
    writes_performed: 0,
  };
}
