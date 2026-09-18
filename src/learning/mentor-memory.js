import { migrate } from '../persistence/migrations.js';

const fallback = [];
const MAX_LESSON = 8000;
const MAX_EVIDENCE = 12000;
const EXPERIENCE_KIND = 'EXPERIENCE';
const UNTRUSTED_PROPOSAL_KINDS = new Set(['CODE_PROPOSAL', 'REPAIR_PROPOSAL']);
const SHA_RE = /^[a-f0-9]{40}$/i;

function bounded(value, max, fallbackValue = '') {
  const out = String(value ?? fallbackValue).trim();
  return out.length > max ? out.slice(0, max) : out;
}

function parseJson(value, fallbackValue) {
  if (value == null) return fallbackValue;
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value); } catch { return fallbackValue; }
}

function normalizeFingerprintPart(value) {
  return String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function hash32(value, seed) {
  let hash = seed >>> 0;
  const text = String(value || '');
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function deterministicExperienceId(fingerprint) {
  const normalized = normalizeFingerprintPart(fingerprint);
  return `experience:${hash32(normalized, 2166136261)}${hash32([...normalized].reverse().join(''), 2246822519)}`;
}

function evidenceObject(row) {
  return parseJson(row?.evidence, {}) || {};
}

function experienceMetadata(row) {
  const meta = evidenceObject(row)?.experience;
  return meta && typeof meta === 'object' ? meta : {};
}

function isTrustedRow(row) {
  const evidence = evidenceObject(row);
  if (row?.kind === EXPERIENCE_KIND) return experienceMetadata(row).validated === true;
  if (UNTRUSTED_PROPOSAL_KINDS.has(row?.kind) && String(row?.outcome || '').toUpperCase() === 'PROPOSED') return false;
  if (evidence?.validation && evidence.validation.validated === false) return false;
  return true;
}

function assertVerifiedCandidateCiProof(proof) {
  const value = proof && typeof proof === 'object' ? proof : {};
  const runId = Number(value.run_id || 0);
  const workflow = String(value.workflow || '');
  const headSha = String(value.head_sha || '');
  const headBranch = String(value.head_branch || '');
  const conclusion = String(value.conclusion || '').toLowerCase();
  const valid = value.verified === true
    && workflow === 'full-candidate-ci'
    && Number.isSafeInteger(runId) && runId > 0
    && SHA_RE.test(headSha)
    && headBranch.startsWith('candidate/')
    && conclusion === 'success';
  if (!valid) {
    throw Object.assign(new Error('MENTOR_EXPERIENCE_PROOF_REQUIRED'), { code: 'MENTOR_EXPERIENCE_PROOF_REQUIRED', status: 422 });
  }
  return {
    verified: true,
    proof_type: 'VERIFIED_CANDIDATE_CI',
    workflow,
    run_id: runId,
    head_sha: headSha,
    head_branch: headBranch,
    conclusion,
  };
}

function relevance(goal, rows) {
  const objective = bounded(goal, 4000).toLowerCase();
  const terms = [...new Set(objective.split(/[^\p{L}\p{N}_-]+/u).filter(x => x.length >= 4))].slice(0, 20);
  return rows.map(row => {
    const haystack = `${row.goal} ${row.lesson} ${(row.tags || []).join(' ')}`.toLowerCase();
    const overlap = terms.reduce((n, term) => n + (haystack.includes(term) ? 1 : 0), 0);
    const successBonus = row.outcome === 'SUCCEEDED' ? 2 : row.outcome === 'FAILED' ? 1 : 0;
    return { row, score: overlap * 3 + successBonus + Number(row.score || 0) };
  }).sort((a, b) => b.score - a.score || b.row.created_at - a.row.created_at);
}

export class MentorMemoryRepository {
  constructor(db) {
    this.db = db;
    this.ready = null;
  }

  async init() {
    if (!this.db) return;
    if (!this.ready) this.ready = migrate(this.db);
    await this.ready;
  }

  async remember({
    id = crypto.randomUUID(),
    job_id = null,
    goal = '',
    kind = 'LESSON',
    lesson,
    evidence = null,
    outcome = 'UNKNOWN',
    score = 0,
    tags = [],
    created_at = Date.now(),
  } = {}) {
    const record = {
      id,
      job_id: job_id ? bounded(job_id, 200) : null,
      goal: bounded(goal, 4000),
      kind: bounded(kind, 80, 'LESSON') || 'LESSON',
      lesson: bounded(lesson, MAX_LESSON),
      evidence: evidence == null ? null : bounded(typeof evidence === 'string' ? evidence : JSON.stringify(evidence), MAX_EVIDENCE),
      outcome: bounded(outcome, 80, 'UNKNOWN') || 'UNKNOWN',
      score: Number.isFinite(Number(score)) ? Number(score) : 0,
      tags: Array.isArray(tags) ? tags.map(x => bounded(x, 80)).filter(Boolean).slice(0, 20) : [],
      created_at,
    };
    if (!record.lesson) throw Object.assign(new Error('MENTOR_LESSON_REQUIRED'), { code: 'MENTOR_LESSON_REQUIRED' });

    await this.init();
    if (!this.db) {
      fallback.unshift(record);
      return structuredClone(record);
    }

    await this.db.prepare(`INSERT INTO mentor_lessons
      (id,job_id,goal,kind,lesson,evidence_json,outcome,score,tags_json,created_at)
      VALUES(?,?,?,?,?,?,?,?,?,?)`)
      .bind(record.id, record.job_id, record.goal, record.kind, record.lesson, record.evidence,
        record.outcome, record.score, JSON.stringify(record.tags), record.created_at).run();
    return record;
  }

  _row(row) {
    if (!row) return null;
    const rawEvidence = row.evidence_json ?? row.evidence ?? null;
    const rawTags = row.tags_json ?? row.tags ?? [];
    return {
      id: row.id,
      job_id: row.job_id || null,
      goal: row.goal || '',
      kind: row.kind || 'LESSON',
      lesson: row.lesson || '',
      evidence: parseJson(rawEvidence, rawEvidence || null),
      outcome: row.outcome || 'UNKNOWN',
      score: Number(row.score || 0),
      tags: parseJson(rawTags, []),
      created_at: Number(row.created_at || 0),
    };
  }

  async _getById(id) {
    await this.init();
    if (!this.db) return this._row(fallback.find(row => row.id === id) || null);
    const result = await this.db.prepare('SELECT * FROM mentor_lessons WHERE id=? LIMIT 1').bind(id).all();
    return this._row((result.results || [])[0] || null);
  }

  async _replace(record) {
    const normalized = {
      id: String(record.id),
      job_id: record.job_id ? bounded(record.job_id, 200) : null,
      goal: bounded(record.goal, 4000),
      kind: bounded(record.kind, 80, 'LESSON') || 'LESSON',
      lesson: bounded(record.lesson, MAX_LESSON),
      evidence: record.evidence == null ? null : bounded(typeof record.evidence === 'string' ? record.evidence : JSON.stringify(record.evidence), MAX_EVIDENCE),
      outcome: bounded(record.outcome, 80, 'UNKNOWN') || 'UNKNOWN',
      score: Number.isFinite(Number(record.score)) ? Number(record.score) : 0,
      tags: Array.isArray(record.tags) ? record.tags.map(x => bounded(x, 80)).filter(Boolean).slice(0, 20) : [],
      created_at: Number(record.created_at || Date.now()),
    };
    await this.init();
    if (!this.db) {
      const index = fallback.findIndex(row => row.id === normalized.id);
      if (index < 0) throw Object.assign(new Error('MENTOR_LESSON_NOT_FOUND'), { code: 'MENTOR_LESSON_NOT_FOUND' });
      fallback[index] = normalized;
      return this._row(normalized);
    }
    await this.db.prepare(`UPDATE mentor_lessons
      SET job_id=?, goal=?, kind=?, lesson=?, evidence_json=?, outcome=?, score=?, tags_json=?
      WHERE id=?`)
      .bind(normalized.job_id, normalized.goal, normalized.kind, normalized.lesson, normalized.evidence,
        normalized.outcome, normalized.score, JSON.stringify(normalized.tags), normalized.id).run();
    return this._row({ ...normalized, evidence_json: normalized.evidence, tags_json: JSON.stringify(normalized.tags) });
  }

  async acquireExperience({
    fingerprint = '',
    job_id = null,
    jobId = null,
    goal = '',
    source_type = 'OBSERVATION',
    sourceType = null,
    lesson,
    evidence = null,
    score = 0,
    tags = [],
    created_at = Date.now(),
  } = {}) {
    const text = bounded(lesson, MAX_LESSON);
    if (!text) throw Object.assign(new Error('MENTOR_EXPERIENCE_REQUIRED'), { code: 'MENTOR_EXPERIENCE_REQUIRED' });
    const source = bounded(sourceType || source_type || 'OBSERVATION', 80, 'OBSERVATION').toUpperCase();
    const supplied = bounded(fingerprint, 1000);
    const canonical = supplied || [source, normalizeFingerprintPart(goal), normalizeFingerprintPart(text)].join('|');
    const id = deterministicExperienceId(canonical);
    const now = Number(created_at || Date.now());
    const existing = await this._getById(id);
    const incomingEvidence = evidence && typeof evidence === 'object' && !Array.isArray(evidence)
      ? { ...evidence }
      : evidence == null ? {} : { value: bounded(evidence, 4000) };
    delete incomingEvidence.experience;

    if (existing) {
      const previousEvidence = evidenceObject(existing);
      const previousMeta = experienceMetadata(existing);
      if (previousMeta.fingerprint && normalizeFingerprintPart(previousMeta.fingerprint) !== normalizeFingerprintPart(canonical)) {
        throw Object.assign(new Error('MENTOR_EXPERIENCE_FINGERPRINT_COLLISION'), { code: 'MENTOR_EXPERIENCE_FINGERPRINT_COLLISION', status: 409 });
      }
      const validated = previousMeta.validated === true;
      const occurrences = Math.max(1, Number(previousMeta.occurrences) || 1) + 1;
      const tagSet = new Set([...(existing.tags || []), ...tags, 'experience']);
      tagSet.delete(validated ? 'unvalidated' : 'validated');
      tagSet.add(validated ? 'validated' : 'unvalidated');
      const mergedEvidence = { ...previousEvidence, ...incomingEvidence };
      if (validated) {
        if (previousEvidence.validation) mergedEvidence.validation = previousEvidence.validation;
        if (previousEvidence.proof_status) mergedEvidence.proof_status = previousEvidence.proof_status;
      }
      const updated = await this._replace({
        ...existing,
        job_id: existing.job_id || jobId || job_id || null,
        goal: existing.goal || goal,
        kind: EXPERIENCE_KIND,
        lesson: existing.lesson || text,
        evidence: {
          ...mergedEvidence,
          experience: {
            ...previousMeta,
            fingerprint: previousMeta.fingerprint || canonical,
            source_type: previousMeta.source_type || source,
            validated,
            occurrences,
            first_seen_at: previousMeta.first_seen_at || existing.created_at || now,
            last_seen_at: now,
          },
        },
        outcome: validated ? 'VALIDATED' : 'OBSERVED',
        score: Math.max(Number(existing.score || 0), Number(score) || 0),
        tags: [...tagSet].slice(0, 20),
        created_at: existing.created_at || now,
      });
      return { ...updated, trust: experienceMetadata(updated).validated === true ? 'VALIDATED' : 'OBSERVATION' };
    }

    const stored = await this.remember({
      id,
      job_id: jobId || job_id || null,
      goal,
      kind: EXPERIENCE_KIND,
      lesson: text,
      evidence: {
        ...incomingEvidence,
        experience: {
          fingerprint: canonical,
          source_type: source,
          validated: false,
          occurrences: 1,
          first_seen_at: now,
          last_seen_at: now,
        },
      },
      outcome: 'OBSERVED',
      score,
      tags: [...new Set([...tags, 'experience', 'unvalidated'])],
      created_at: now,
    });
    const normalized = this._row(stored);
    return { ...normalized, trust: 'OBSERVATION' };
  }

  async validateExperience({ id = null, fingerprint = '', proof = null, validated_at = Date.now() } = {}) {
    const verified = assertVerifiedCandidateCiProof(proof);
    const suppliedFingerprint = bounded(fingerprint, 1000);
    const targetId = id ? String(id) : suppliedFingerprint ? deterministicExperienceId(suppliedFingerprint) : '';
    if (!targetId) {
      throw Object.assign(new Error('MENTOR_EXPERIENCE_ID_REQUIRED'), { code: 'MENTOR_EXPERIENCE_ID_REQUIRED', status: 422 });
    }
    const existing = await this._getById(targetId);
    if (!existing || existing.kind !== EXPERIENCE_KIND) {
      throw Object.assign(new Error('MENTOR_EXPERIENCE_NOT_FOUND'), { code: 'MENTOR_EXPERIENCE_NOT_FOUND', status: 404 });
    }
    const previousEvidence = evidenceObject(existing);
    const previousMeta = experienceMetadata(existing);
    if (suppliedFingerprint && previousMeta.fingerprint
      && normalizeFingerprintPart(previousMeta.fingerprint) !== normalizeFingerprintPart(suppliedFingerprint)) {
      throw Object.assign(new Error('MENTOR_EXPERIENCE_FINGERPRINT_MISMATCH'), { code: 'MENTOR_EXPERIENCE_FINGERPRINT_MISMATCH', status: 409 });
    }
    if (previousMeta.validated === true) return { ...existing, trust: 'VALIDATED' };

    const now = Number(validated_at || Date.now());
    const tags = new Set([...(existing.tags || []), 'experience', 'validated']);
    tags.delete('unvalidated');
    const updated = await this._replace({
      ...existing,
      evidence: {
        ...previousEvidence,
        proof_status: 'VERIFIED_CANDIDATE_CI',
        validation: {
          ...(previousEvidence.validation && typeof previousEvidence.validation === 'object' ? previousEvidence.validation : {}),
          ...verified,
          validated: true,
          validated_at: now,
        },
        experience: {
          ...previousMeta,
          validated: true,
          validated_at: now,
        },
      },
      outcome: 'VALIDATED',
      tags: [...tags].slice(0, 20),
    });
    return { ...updated, trust: 'VALIDATED' };
  }

  async recent({ limit = 12, kind = null, outcome = null } = {}) {
    const boundedLimit = Math.max(1, Math.min(500, Number(limit) || 12));
    await this.init();
    if (!this.db) {
      return fallback
        .filter(x => !kind || x.kind === kind)
        .filter(x => !outcome || x.outcome === outcome)
        .slice(0, boundedLimit)
        .map(x => this._row(x));
    }

    const clauses = [];
    const args = [];
    if (kind) { clauses.push('kind=?'); args.push(String(kind)); }
    if (outcome) { clauses.push('outcome=?'); args.push(String(outcome)); }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const result = await this.db.prepare(`SELECT * FROM mentor_lessons ${where} ORDER BY created_at DESC LIMIT ?`)
      .bind(...args, boundedLimit).all();
    return (result.results || []).map(row => this._row(row));
  }

  async all({ kind = null, outcome = null } = {}) {
    await this.init();
    if (!this.db) {
      return fallback
        .filter(x => !kind || x.kind === kind)
        .filter(x => !outcome || x.outcome === outcome)
        .map(x => this._row(x));
    }

    const clauses = [];
    const args = [];
    if (kind) { clauses.push('kind=?'); args.push(String(kind)); }
    if (outcome) { clauses.push('outcome=?'); args.push(String(outcome)); }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const result = await this.db.prepare(`SELECT * FROM mentor_lessons ${where} ORDER BY created_at DESC`)
      .bind(...args).all();
    return (result.results || []).map(row => this._row(row));
  }

  async experienceContext(goal, { limit = 10 } = {}) {
    const boundedLimit = Math.max(1, Math.min(20, Number(limit) || 10));
    const rows = await this.recent({ limit: Math.max(20, Math.min(500, boundedLimit * 12)), kind: EXPERIENCE_KIND });
    const ranked = relevance(goal, rows).slice(0, boundedLimit).map(({ row }) => {
      const meta = experienceMetadata(row);
      return {
        id: row.id,
        job_id: row.job_id,
        goal: row.goal,
        lesson: row.lesson,
        source_type: meta.source_type || 'OBSERVATION',
        occurrences: Math.max(1, Number(meta.occurrences) || 1),
        trust: meta.validated === true ? 'VALIDATED' : 'OBSERVATION',
        validated: meta.validated === true,
        created_at: row.created_at,
      };
    });
    return {
      validated: ranked.filter(row => row.validated),
      observations: ranked.filter(row => !row.validated),
    };
  }

  async context(goal, { limit = 10 } = {}) {
    const rows = await this.recent({ limit: Math.max(10, Math.min(200, Number(limit) * 8 || 80)) });
    const trusted = rows.filter(isTrustedRow);
    const scored = relevance(goal, trusted);
    return scored.slice(0, Math.max(1, Math.min(20, Number(limit) || 10))).map(x => x.row);
  }
}
