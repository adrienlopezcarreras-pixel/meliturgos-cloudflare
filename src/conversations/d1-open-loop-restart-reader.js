const ACTIVE = new Set(['open','waiting','resumable','failed','resuming']);

function boundedLimit(value, fallback = 50) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(100, Math.trunc(parsed)));
}

function parseJson(value, code) {
  try {
    const parsed = JSON.parse(value || '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    const error = new Error(code);
    error.code = code;
    throw error;
  }
}

function rowToSummary(row) {
  return {
    id: String(row.id || ''),
    owner: String(row.owner || ''),
    task_id: String(row.task_id || ''),
    conversation_id: String(row.conversation_id || ''),
    status: ACTIVE.has(String(row.status || '').toLowerCase()) ? String(row.status).toLowerCase() : 'unknown',
    priority: Number(row.priority || 0),
    next_action: String(row.next_action || ''),
    resume_at: Number(row.resume_at || 0),
    checkpoint: parseJson(row.checkpoint_json, 'OPEN_LOOP_CHECKPOINT_CORRUPT'),
    metadata: parseJson(row.metadata_json, 'OPEN_LOOP_METADATA_CORRUPT'),
    updated_at: Number(row.updated_at || 0),
    lease_until: row.lease_until == null ? null : Number(row.lease_until),
  };
}

export class D1OpenLoopRestartReader {
  constructor(db) {
    if (!db) throw Object.assign(new Error('OPEN_LOOP_DB_REQUIRED'), { code: 'OPEN_LOOP_DB_REQUIRED' });
    this.db = db;
    this._ready = false;
  }

  async ready() {
    if (this._ready) return this;
    await this.db.prepare(`CREATE TABLE IF NOT EXISTS mel_open_loops (
      id TEXT PRIMARY KEY,
      owner TEXT NOT NULL DEFAULT '',
      task_id TEXT NOT NULL,
      conversation_id TEXT NOT NULL,
      source_event_id TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL,
      priority INTEGER NOT NULL DEFAULT 0,
      next_action TEXT NOT NULL DEFAULT '',
      resume_at INTEGER NOT NULL DEFAULT 0,
      checkpoint_json TEXT NOT NULL DEFAULT '{}',
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      completed_at INTEGER,
      lease_token TEXT,
      lease_until INTEGER
    )`).run();
    this._ready = true;
    return this;
  }

  async listActive({ owner, limit = 50 } = {}) {
    await this.ready();
    const normalizedOwner = String(owner || '').trim();
    if (!normalizedOwner) throw Object.assign(new Error('OPEN_LOOP_OWNER_REQUIRED'), { code: 'OPEN_LOOP_OWNER_REQUIRED' });

    const result = await this.db.prepare(`SELECT
        id,owner,task_id,conversation_id,status,priority,next_action,resume_at,
        checkpoint_json,metadata_json,updated_at,lease_until
      FROM mel_open_loops
      WHERE owner=? AND status IN ('open','waiting','resumable','failed','resuming')
      ORDER BY priority DESC, resume_at ASC, updated_at DESC
      LIMIT ?`).bind(
      normalizedOwner,
      boundedLimit(limit),
    ).all();

    return (result?.results || []).map(rowToSummary);
  }
}
