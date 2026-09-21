import { requireValue } from '../core/contracts.js';

const MAX_PROVENANCE_VALUES = 32;
const MAX_TOPICS = 16;

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


function parseJson(value, fallback) {
  if (value == null || value === '') return fallback;
  if (typeof value === 'object') return value;
  try { return JSON.parse(String(value)); } catch { return fallback; }
}

function uniqueNestedValues(rows, selector) {
  const values = [];
  for (const row of rows) {
    const selected = selector(row);
    for (const value of (Array.isArray(selected) ? selected : [selected])) {
      if (value == null || value === '') continue;
      const text = typeof value === 'string' ? value.trim() : JSON.stringify(value);
      if (!text || values.includes(text)) continue;
      values.push(text);
      if (values.length >= MAX_PROVENANCE_VALUES) return values;
    }
  }
  return values;
}

function candidateKind(row) {
  return String(row?.kind || row?.role || 'fact').trim() || 'fact';
}

function candidateProvenance(rows) {
  const structured = rows.map(row => parseJson(row?.provenance_json ?? row?.provenance, {}));
  const contradictions = uniqueNestedValues(rows, row => parseJson(row?.contradictions_json, []));
  const fragments = uniqueNestedValues(rows, row => row?.fragment || normalizeMemoryContent(row?.content || '').slice(0, 1000));
  const observedAt = uniqueNestedValues(rows, row => row?.observed_at ?? parseJson(row?.provenance_json, {})?.observed_at ?? row?.created_at);
  const roles = uniqueNestedValues(rows, row => parseJson(row?.provenance_json, {})?.role);
  const archiveSources = uniqueNestedValues(rows, row => parseJson(row?.provenance_json, {})?.source);
  return Object.freeze({
    version: 2,
    compiler: 'mel-memory-compiler',
    candidate_ids: uniqueValues(rows, 'id'),
    conversation_ids: uniqueValues(rows, 'conversation_id'),
    message_ids: uniqueValues(rows, 'message_id'),
    sources: uniqueValues(rows, 'source'),
    observations: rows.length,
    fragments,
    observed_at: observedAt,
    roles,
    archive_sources: archiveSources,
    contradictions,
    evidence: structured.slice(0, MAX_PROVENANCE_VALUES),
  });
}

function timestampMs(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const numeric = Number(value);
  if (Number.isFinite(numeric) && String(value).trim() !== '') return numeric;
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : null;
}

function recencySummary(rows) {
  const timestamps = rows
    .map(row => ({ raw: row?.created_at ?? null, ms: timestampMs(row?.created_at) }))
    .filter(item => item.ms != null)
    .sort((a, b) => a.ms - b.ms);
  if (!timestamps.length) {
    return Object.freeze({ first_observed_at: null, last_observed_at: null, observation_span_ms: null, timestamped_observations: 0 });
  }
  return Object.freeze({
    first_observed_at: timestamps[0].raw,
    last_observed_at: timestamps[timestamps.length - 1].raw,
    observation_span_ms: Math.max(0, timestamps[timestamps.length - 1].ms - timestamps[0].ms),
    timestamped_observations: timestamps.length,
  });
}

function normalizeTopic(value) {
  const topic = normalizeMemoryContent(value).toLocaleLowerCase('fr-FR');
  return topic || null;
}

function candidateTopics(rows) {
  const topics = [];
  for (const row of rows) {
    const values = [
      row?.topic,
      ...(Array.isArray(row?.topics) ? row.topics : row?.topics == null ? [] : [row.topics]),
    ];
    for (const value of values) {
      if (value == null) continue;
      const topic = normalizeTopic(value);
      if (topic && !topics.includes(topic)) topics.push(topic);
      if (topics.length >= MAX_TOPICS) return Object.freeze(topics);
    }
  }
  return Object.freeze(topics);
}

function qualitySummary(rows, confidence, provenance) {
  const timestamped = rows.filter(row => timestampMs(row?.created_at) != null).length;
  return Object.freeze({
    score: confidence,
    policy: 'MAX_OBSERVED_CONFIDENCE_NO_DUPLICATE_BOOST',
    observations: rows.length,
    distinct_sources: provenance.sources.length,
    timestamp_coverage: rows.length ? timestamped / rows.length : 0,
    provenance_complete: provenance.candidate_ids.length > 0 && provenance.sources.length > 0,
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
 * - every proposal carries bounded source provenance, recency and topics;
 * - quality is evidence metadata, never a synthetic confidence boost;
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
    rows.sort((a, b) => (timestampMs(a.created_at) ?? Number.NEGATIVE_INFINITY) - (timestampMs(b.created_at) ?? Number.NEGATIVE_INFINITY));
    const strongestConfidence = Math.max(...rows.map(row => row.confidence));
    const strongest = rows.reduce((best, row) => row.confidence > best.confidence ? row : best, rows[0]);
    const duplicate = existing.find(item => item.key === key)?.row || null;
    const provenance = candidateProvenance(rows);
    const recency = recencySummary(rows);
    const topics = candidateTopics(rows);
    const quality = qualitySummary(rows, strongestConfidence, provenance);

    proposals.push({
      action: duplicate ? 'REUSE_EXISTING' : 'PROPOSE_MEMORY',
      existing_memory_id: duplicate?.id ?? null,
      content: strongest.content,
      kind: strongest.kind,
      confidence: strongestConfidence,
      confidence_policy: 'MAX_OBSERVED_NO_DUPLICATE_BOOST',
      quality,
      recency,
      topics,
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
