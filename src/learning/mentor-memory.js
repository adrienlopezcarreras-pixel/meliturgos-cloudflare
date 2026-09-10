import { migrate } from '../persistence/migrations.js';

const fallback = [];
const MAX_LESSON = 8000;
const MAX_EVIDENCE = 12000;

function bounded(value, max, fallbackValue = '') {
  const out = String(value ?? fallbackValue).trim();
  return out.length > max ? out.slice(0, max) : out;
}

function parseJson(value, fallbackValue) {
  if (value == null) return fallbackValue;
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value); } catch { return fallbackValue; }
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
      if (fallback.length > 500) fallback.length = 500;
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
    return {
      id: row.id,
      job_id: row.job_id || null,
      goal: row.goal || '',
      kind: row.kind || 'LESSON',
      lesson: row.lesson || '',
      evidence: parseJson(row.evidence_json, row.evidence_json || null),
      outcome: row.outcome || 'UNKNOWN',
      score: Number(row.score || 0),
      tags: parseJson(row.tags_json, []),
      created_at: Number(row.created_at || 0),
    };
  }

  async recent({ limit = 12, kind = null, outcome = null } = {}) {
    const boundedLimit = Math.max(1, Math.min(50, Number(limit) || 12));
    await this.init();
    if (!this.db) {
      return fallback
        .filter(x => !kind || x.kind === kind)
        .filter(x => !outcome || x.outcome === outcome)
        .slice(0, boundedLimit)
        .map(x => structuredClone(x));
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

  async context(goal, { limit = 10 } = {}) {
    const objective = bounded(goal, 4000).toLowerCase();
    const rows = await this.recent({ limit: Math.max(10, Math.min(50, Number(limit) * 4 || 40)) });
    const terms = [...new Set(objective.split(/[^\p{L}\p{N}_-]+/u).filter(x => x.length >= 4))].slice(0, 20);
    const scored = rows.map(row => {
      const haystack = `${row.goal} ${row.lesson} ${(row.tags || []).join(' ')}`.toLowerCase();
      const overlap = terms.reduce((n, term) => n + (haystack.includes(term) ? 1 : 0), 0);
      const successBonus = row.outcome === 'SUCCEEDED' ? 2 : row.outcome === 'FAILED' ? 1 : 0;
      return { row, score: overlap * 3 + successBonus + Number(row.score || 0) };
    }).sort((a, b) => b.score - a.score || b.row.created_at - a.row.created_at);
    return scored.slice(0, Math.max(1, Math.min(20, Number(limit) || 10))).map(x => x.row);
  }
}
