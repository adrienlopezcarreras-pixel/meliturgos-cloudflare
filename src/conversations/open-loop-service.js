const ACTIVE_STATUSES = new Set(['open', 'waiting', 'resumable', 'failed']);
const TERMINAL_STATUSES = new Set(['completed', 'cancelled']);

function asText(value) {
  return String(value ?? '').trim();
}

function asNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function normalizeStatus(status) {
  const value = asText(status).toLowerCase();
  if (ACTIVE_STATUSES.has(value) || TERMINAL_STATUSES.has(value) || value === 'resuming') return value;
  return 'open';
}

function eventStatus(type, payload = {}) {
  const value = asText(type).toLowerCase();
  if (['task.completed', 'work.completed', 'job.completed'].includes(value)) return 'completed';
  if (['task.cancelled', 'work.cancelled', 'job.cancelled'].includes(value)) return 'cancelled';
  if (['task.failed', 'work.failed', 'job.failed'].includes(value)) {
    return payload.retryable === false ? 'cancelled' : 'failed';
  }
  if (['task.paused', 'work.paused', 'task.waiting', 'work.waiting'].includes(value)) return 'waiting';
  if (['task.resumable', 'work.resumable', 'followup.due', 'checkpoint.ready'].includes(value)) return 'resumable';
  return null;
}

export function openLoopId({ taskId, conversationId }) {
  const task = asText(taskId);
  const conversation = asText(conversationId);
  if (!task) throw new Error('taskId required');
  if (!conversation) throw new Error('conversationId required');
  return `${conversation}::${task}`;
}

function normalizeLoop(input = {}, now = Date.now()) {
  const taskId = asText(input.taskId);
  const conversationId = asText(input.conversationId);
  const id = asText(input.id) || openLoopId({ taskId, conversationId });
  if (!taskId) throw new Error('taskId required');
  if (!conversationId) throw new Error('conversationId required');

  const status = normalizeStatus(input.status);
  return {
    id,
    owner: asText(input.owner),
    taskId,
    conversationId,
    sourceEventId: asText(input.sourceEventId),
    status,
    priority: asNumber(input.priority, 0),
    nextAction: asText(input.nextAction),
    resumeAt: Math.max(0, asNumber(input.resumeAt, 0)),
    checkpoint: clone(input.checkpoint || {}),
    metadata: clone(input.metadata || {}),
    createdAt: asNumber(input.createdAt, now),
    updatedAt: asNumber(input.updatedAt, now),
    completedAt: TERMINAL_STATUSES.has(status) ? asNumber(input.completedAt, now) : null,
    leaseToken: input.leaseToken ? asText(input.leaseToken) : null,
    leaseUntil: input.leaseUntil == null ? null : asNumber(input.leaseUntil, null),
  };
}

function rowToLoop(row) {
  if (!row) return null;
  return normalizeLoop({
    id: row.id,
    owner: row.owner,
    taskId: row.task_id,
    conversationId: row.conversation_id,
    sourceEventId: row.source_event_id,
    status: row.status,
    priority: row.priority,
    nextAction: row.next_action,
    resumeAt: row.resume_at,
    checkpoint: row.checkpoint_json ? JSON.parse(row.checkpoint_json) : {},
    metadata: row.metadata_json ? JSON.parse(row.metadata_json) : {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at,
    leaseToken: row.lease_token,
    leaseUntil: row.lease_until,
  }, row.updated_at || Date.now());
}

export class D1OpenLoopStore {
  constructor(db) {
    if (!db) throw new Error('D1 database required');
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
    await this.db.prepare('CREATE INDEX IF NOT EXISTS idx_mel_open_loops_due ON mel_open_loops(status, resume_at, priority, updated_at)').run();
    await this.db.prepare('CREATE INDEX IF NOT EXISTS idx_mel_open_loops_owner ON mel_open_loops(owner, status, updated_at)').run();
    this._ready = true;
    return this;
  }

  async get(id) {
    await this.ready();
    return rowToLoop(await this.db.prepare('SELECT * FROM mel_open_loops WHERE id=?').bind(id).first());
  }

  async upsert(input) {
    await this.ready();
    const loop = normalizeLoop(input, input.updatedAt || Date.now());
    await this.db.prepare(`INSERT INTO mel_open_loops(
      id, owner, task_id, conversation_id, source_event_id, status, priority,
      next_action, resume_at, checkpoint_json, metadata_json, created_at,
      updated_at, completed_at, lease_token, lease_until
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      owner=excluded.owner,
      task_id=excluded.task_id,
      conversation_id=excluded.conversation_id,
      source_event_id=excluded.source_event_id,
      status=excluded.status,
      priority=excluded.priority,
      next_action=excluded.next_action,
      resume_at=excluded.resume_at,
      checkpoint_json=excluded.checkpoint_json,
      metadata_json=excluded.metadata_json,
      updated_at=excluded.updated_at,
      completed_at=excluded.completed_at,
      lease_token=excluded.lease_token,
      lease_until=excluded.lease_until`).bind(
      loop.id,
      loop.owner,
      loop.taskId,
      loop.conversationId,
      loop.sourceEventId,
      loop.status,
      loop.priority,
      loop.nextAction,
      loop.resumeAt,
      JSON.stringify(loop.checkpoint || {}),
      JSON.stringify(loop.metadata || {}),
      loop.createdAt,
      loop.updatedAt,
      loop.completedAt,
      loop.leaseToken,
      loop.leaseUntil,
    ).run();
    return this.get(loop.id);
  }

  async listDue({ owner = '', now = Date.now(), limit = 25 } = {}) {
    await this.ready();
    const capped = Math.max(1, Math.min(100, Math.trunc(asNumber(limit, 25))));
    const result = owner
      ? await this.db.prepare(`SELECT * FROM mel_open_loops
          WHERE owner=? AND status IN ('open','waiting','resumable','failed')
            AND resume_at<=? AND (lease_until IS NULL OR lease_until<?)
          ORDER BY priority DESC, resume_at ASC, updated_at ASC LIMIT ?`).bind(owner, now, now, capped).all()
      : await this.db.prepare(`SELECT * FROM mel_open_loops
          WHERE status IN ('open','waiting','resumable','failed')
            AND resume_at<=? AND (lease_until IS NULL OR lease_until<?)
          ORDER BY priority DESC, resume_at ASC, updated_at ASC LIMIT ?`).bind(now, now, capped).all();
    return (result.results || []).map(rowToLoop);
  }

  async claim(id, { token, now = Date.now(), leaseMs = 60_000 } = {}) {
    await this.ready();
    const leaseToken = asText(token);
    if (!leaseToken) throw new Error('claim token required');
    const leaseUntil = now + Math.max(1_000, asNumber(leaseMs, 60_000));
    const result = await this.db.prepare(`UPDATE mel_open_loops
      SET status='resuming', lease_token=?, lease_until=?, updated_at=?
      WHERE id=? AND status IN ('open','waiting','resumable','failed')
        AND resume_at<=? AND (lease_until IS NULL OR lease_until<?)`).bind(
      leaseToken, leaseUntil, now, id, now, now,
    ).run();
    if (!result?.meta?.changes) return null;
    return this.get(id);
  }
}

export class MemoryOpenLoopStore {
  constructor() {
    this.rows = new Map();
  }

  async get(id) {
    return clone(this.rows.get(id) || null);
  }

  async upsert(input) {
    const loop = normalizeLoop(input, input.updatedAt || Date.now());
    const previous = this.rows.get(loop.id);
    if (previous && !input.createdAt) loop.createdAt = previous.createdAt;
    this.rows.set(loop.id, clone(loop));
    return this.get(loop.id);
  }

  async listDue({ owner = '', now = Date.now(), limit = 25 } = {}) {
    return [...this.rows.values()]
      .filter((loop) => (!owner || loop.owner === owner)
        && ACTIVE_STATUSES.has(loop.status)
        && loop.resumeAt <= now
        && (!loop.leaseUntil || loop.leaseUntil < now))
      .sort((a, b) => (b.priority - a.priority) || (a.resumeAt - b.resumeAt) || (a.updatedAt - b.updatedAt))
      .slice(0, limit)
      .map(clone);
  }

  async claim(id, { token, now = Date.now(), leaseMs = 60_000 } = {}) {
    const loop = this.rows.get(id);
    if (!loop || !ACTIVE_STATUSES.has(loop.status) || loop.resumeAt > now || (loop.leaseUntil && loop.leaseUntil >= now)) return null;
    loop.status = 'resuming';
    loop.leaseToken = asText(token);
    loop.leaseUntil = now + leaseMs;
    loop.updatedAt = now;
    this.rows.set(id, clone(loop));
    return clone(loop);
  }
}

export class OpenLoopService {
  constructor(store, { now = () => Date.now(), id = () => crypto.randomUUID() } = {}) {
    if (!store) throw new Error('open-loop store required');
    this.store = store;
    this.now = now;
    this.id = id;
  }

  async capture(input = {}) {
    const now = this.now();
    const id = asText(input.id) || openLoopId(input);
    const previous = await this.store.get(id);
    if (previous && input.sourceEventId && previous.sourceEventId === input.sourceEventId) return previous;
    return this.store.upsert(normalizeLoop({
      ...previous,
      ...input,
      id,
      createdAt: previous?.createdAt || now,
      updatedAt: now,
      metadata: { ...(previous?.metadata || {}), ...(input.metadata || {}) },
      checkpoint: input.checkpoint ?? previous?.checkpoint ?? {},
      leaseToken: null,
      leaseUntil: null,
    }, now));
  }

  async recordEvent({ id = '', type, taskId, conversationId, owner = '', payload = {}, at } = {}) {
    const now = asNumber(at, this.now());
    const loopId = asText(id) || openLoopId({ taskId, conversationId });
    const previous = await this.store.get(loopId);
    if (!previous) {
      if (!taskId || !conversationId) throw new Error('unknown loop requires taskId and conversationId');
      return this.capture({
        id: loopId,
        taskId,
        conversationId,
        owner,
        sourceEventId: payload.eventId || '',
        status: eventStatus(type, payload) || 'open',
        nextAction: payload.nextAction || '',
        resumeAt: payload.resumeAt ?? 0,
        checkpoint: payload.checkpoint || {},
        metadata: { lastEventType: asText(type) },
      });
    }

    const eventId = asText(payload.eventId);
    if (eventId && previous.sourceEventId === eventId) return previous;
    const status = eventStatus(type, payload) || previous.status;
    return this.store.upsert(normalizeLoop({
      ...previous,
      sourceEventId: eventId || previous.sourceEventId,
      status,
      nextAction: payload.nextAction ?? previous.nextAction,
      resumeAt: payload.resumeAt ?? previous.resumeAt,
      checkpoint: payload.checkpoint ?? previous.checkpoint,
      metadata: {
        ...(previous.metadata || {}),
        ...(payload.metadata || {}),
        lastEventType: asText(type),
      },
      updatedAt: now,
      completedAt: TERMINAL_STATUSES.has(status) ? now : null,
      leaseToken: null,
      leaseUntil: null,
    }, now));
  }

  async resumeDue({ owner = '', limit = 10, execute, leaseMs = 60_000, retryDelayMs = 60_000 } = {}) {
    if (typeof execute !== 'function') throw new Error('execute callback required');
    const now = this.now();
    const due = await this.store.listDue({ owner, now, limit });
    const outcomes = [];

    for (const candidate of due) {
      const token = this.id();
      const claimed = await this.store.claim(candidate.id, { token, now, leaseMs });
      if (!claimed) continue;
      try {
        const result = await execute(clone(claimed));
        const completed = result?.completed === true;
        const status = completed ? 'completed' : normalizeStatus(result?.status || 'resumable');
        const saved = await this.store.upsert(normalizeLoop({
          ...claimed,
          status,
          nextAction: result?.nextAction ?? claimed.nextAction,
          resumeAt: completed ? 0 : Math.max(now, asNumber(result?.resumeAt, now)),
          checkpoint: result?.checkpoint ?? claimed.checkpoint,
          metadata: { ...(claimed.metadata || {}), ...(result?.metadata || {}) },
          updatedAt: now,
          completedAt: completed ? now : null,
          leaseToken: null,
          leaseUntil: null,
        }, now));
        outcomes.push({ id: candidate.id, ok: true, loop: saved });
      } catch (error) {
        const saved = await this.store.upsert(normalizeLoop({
          ...claimed,
          status: 'failed',
          resumeAt: now + Math.max(1_000, asNumber(retryDelayMs, 60_000)),
          metadata: {
            ...(claimed.metadata || {}),
            lastError: asText(error?.message || error),
          },
          updatedAt: now,
          completedAt: null,
          leaseToken: null,
          leaseUntil: null,
        }, now));
        outcomes.push({ id: candidate.id, ok: false, error: saved.metadata.lastError, loop: saved });
      }
    }
    return outcomes;
  }
}

export function createOpenLoopService(env, options = {}) {
  if (!env?.DB) throw new Error('env.DB required');
  return new OpenLoopService(new D1OpenLoopStore(env.DB), options);
}
