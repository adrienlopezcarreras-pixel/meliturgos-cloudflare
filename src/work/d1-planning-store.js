import { validateWorkPlan } from './planning-engine.js';

export const PLAN_STATUSES = Object.freeze({
  PLANNED: 'PLANNED',
  ACTIVE: 'ACTIVE',
  COMPLETED: 'COMPLETED',
  BLOCKED: 'BLOCKED',
  CANCELLED: 'CANCELLED',
});

export const TASK_STATUSES = Object.freeze({
  PENDING: 'PENDING',
  RUNNING: 'RUNNING',
  COMPLETED: 'COMPLETED',
  BLOCKED: 'BLOCKED',
  CANCELLED: 'CANCELLED',
});

const TASK_TRANSITIONS = Object.freeze({
  PENDING: new Set(['RUNNING', 'BLOCKED', 'CANCELLED']),
  RUNNING: new Set(['COMPLETED', 'BLOCKED', 'CANCELLED']),
  BLOCKED: new Set(['PENDING', 'CANCELLED']),
  COMPLETED: new Set(),
  CANCELLED: new Set(),
});

const MAX_RECORD_BYTES = 900_000;
const SECRET_KEY = /(secret|token|password|authorization|cookie|api[_-]?key|otp|private[_-]?key|credential)/i;
const SECRET_VALUE = /(bearer\s+[a-z0-9._~+/=-]{8,}|\bsk-[a-z0-9_-]{8,}|\bgh[pousr]_[a-z0-9]{12,})/i;

function cleanEventDetail(value, depth = 0) {
  if (depth > 5) return '[TRUNCATED]';
  if (value == null || typeof value === 'boolean' || typeof value === 'number') return value;
  if (typeof value === 'string') return SECRET_VALUE.test(value) ? '[REDACTED]' : value.slice(0, 4000);
  if (Array.isArray(value)) return value.slice(0, 50).map(item => cleanEventDetail(item, depth + 1));
  if (typeof value === 'object') {
    const out = {};
    for (const [key, item] of Object.entries(value).slice(0, 80)) {
      if (SECRET_KEY.test(key)) continue;
      out[key] = cleanEventDetail(item, depth + 1);
    }
    return out;
  }
  return String(value).slice(0, 4000);
}

function planningError(code) {
  return Object.assign(new Error(code), { code });
}

function derivePlanStatus(tasks) {
  if (tasks.every((task) => task.status === TASK_STATUSES.COMPLETED)) return PLAN_STATUSES.COMPLETED;
  if (tasks.some((task) => task.status === TASK_STATUSES.BLOCKED)) return PLAN_STATUSES.BLOCKED;
  if (tasks.some((task) => [TASK_STATUSES.RUNNING, TASK_STATUSES.COMPLETED].includes(task.status))) return PLAN_STATUSES.ACTIVE;
  if (tasks.every((task) => task.status === TASK_STATUSES.CANCELLED)) return PLAN_STATUSES.CANCELLED;
  return PLAN_STATUSES.PLANNED;
}

function publicRecord(record) {
  return {
    schema: record.schema,
    version: record.version,
    id: record.id,
    goal: record.goal,
    conversation_id: record.conversation_id || record.plan?.conversation_id || null,
    status: record.status,
    work_dag_id: record.work_dag_id || null,
    created_at: record.created_at,
    updated_at: record.updated_at,
    tasks: record.tasks.map((task) => ({
      id: task.id,
      title: task.title,
      capability: task.capability,
      depends_on: [...task.depends_on],
      idempotent: task.idempotent,
      status: task.status,
      updated_at: task.updated_at,
    })),
  };
}

export class D1PlanningStore {
  constructor(db) {
    if (!db) throw planningError('WORK_PLAN_DB_REQUIRED');
    this.db = db;
    this.ready = null;
  }

  async init() {
    if (!this.ready) {
      this.ready = Promise.all([
        this.db.prepare(`CREATE TABLE IF NOT EXISTS work_plans (
          id TEXT PRIMARY KEY,
          status TEXT NOT NULL,
          goal TEXT NOT NULL,
          work_dag_id TEXT,
          record_json TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        )`).run(),
        this.db.prepare(`CREATE TABLE IF NOT EXISTS work_plan_events (
          event_id TEXT PRIMARY KEY,
          plan_id TEXT NOT NULL,
          event_type TEXT NOT NULL,
          detail_json TEXT NOT NULL,
          created_at INTEGER NOT NULL
        )`).run(),
      ]);
    }
    await this.ready;
  }

  async appendEvent(planId, eventType, detail = {}) {
    await this.init();
    const now = Date.now();
    const event = {
      event_id: crypto.randomUUID(),
      plan_id: String(planId),
      event_type: String(eventType).slice(0, 100),
      detail: cleanEventDetail(detail && typeof detail === 'object' && !Array.isArray(detail) ? detail : {}),
      created_at: now,
    };
    const serialized = JSON.stringify(event.detail);
    if (new TextEncoder().encode(serialized).length > 50_000) throw planningError('WORK_PLAN_EVENT_TOO_LARGE');
    await this.db.prepare(`INSERT INTO work_plan_events(event_id,plan_id,event_type,detail_json,created_at)
      VALUES(?,?,?,?,?)`).bind(event.event_id, event.plan_id, event.event_type, serialized, event.created_at).run();
    return event;
  }

  async create(plan) {
    await this.init();
    validateWorkPlan(plan);
    const existing = await this.db.prepare('SELECT record_json FROM work_plans WHERE id=?').bind(plan.id).first();
    if (existing) throw planningError('WORK_PLAN_ALREADY_EXISTS');

    const now = Date.now();
    const record = {
      schema: 'mel.work-plan-record',
      version: 1,
      id: plan.id,
      goal: plan.goal,
      conversation_id: plan.conversation_id || null,
      status: PLAN_STATUSES.PLANNED,
      work_dag_id: null,
      plan,
      tasks: plan.steps.map((step) => ({
        id: step.id,
        title: step.title,
        capability: step.capability,
        depends_on: [...step.depends_on],
        idempotent: step.idempotent === true,
        status: TASK_STATUSES.PENDING,
        updated_at: now,
      })),
      created_at: now,
      updated_at: now,
    };
    const serialized = JSON.stringify(record);
    if (new TextEncoder().encode(serialized).length > MAX_RECORD_BYTES) throw planningError('WORK_PLAN_RECORD_TOO_LARGE');

    await this.db.prepare(`INSERT INTO work_plans(id,status,goal,work_dag_id,record_json,created_at,updated_at)
      VALUES(?,?,?,?,?,?,?)`)
      .bind(record.id, record.status, record.goal, null, serialized, now, now).run();

    await this.appendEvent(record.id, 'PLAN_CREATED', {
      step_count: record.tasks.length,
      source: plan.source,
    });
    return publicRecord(record);
  }

  async loadRecord(planId) {
    await this.init();
    const row = await this.db.prepare('SELECT record_json FROM work_plans WHERE id=?').bind(String(planId)).first();
    if (!row) return null;
    let record;
    try {
      record = JSON.parse(row.record_json);
    } catch {
      throw planningError('WORK_PLAN_STORE_CORRUPT');
    }
    if (record?.schema !== 'mel.work-plan-record' || record.version !== 1 || record.id !== String(planId)) {
      throw planningError('WORK_PLAN_STORE_CORRUPT');
    }
    validateWorkPlan(record.plan);
    if (!Array.isArray(record.tasks) || record.tasks.length !== record.plan.steps.length) {
      throw planningError('WORK_PLAN_STORE_CORRUPT');
    }
    return record;
  }

  async get(planId) {
    const record = await this.loadRecord(planId);
    return record ? publicRecord(record) : null;
  }

  async list({ limit = 20, status = null } = {}) {
    await this.init();
    const bounded = Math.max(1, Math.min(100, Number(limit) || 20));
    const normalizedStatus = status ? String(status).toUpperCase() : null;
    if (normalizedStatus && !Object.values(PLAN_STATUSES).includes(normalizedStatus)) {
      throw planningError('WORK_PLAN_STATUS_INVALID');
    }
    let sql = 'SELECT id,status,goal,work_dag_id,created_at,updated_at FROM work_plans';
    const values = [];
    if (normalizedStatus) {
      sql += ' WHERE status=?';
      values.push(normalizedStatus);
    }
    sql += ' ORDER BY updated_at DESC LIMIT ?';
    values.push(bounded);
    const query = this.db.prepare(sql).bind(...values);
    const result = await query.all();
    return (result?.results || []).map((row) => ({
      id: String(row.id),
      status: String(row.status),
      goal: String(row.goal).slice(0, 4000),
      work_dag_id: row.work_dag_id ? String(row.work_dag_id) : null,
      created_at: Number(row.created_at) || null,
      updated_at: Number(row.updated_at) || null,
    }));
  }

  async history(planId, { limit = 100 } = {}) {
    await this.init();
    const bounded = Math.max(1, Math.min(200, Number(limit) || 100));
    const result = await this.db.prepare(
      'SELECT event_id,event_type,detail_json,created_at FROM work_plan_events WHERE plan_id=? ORDER BY created_at ASC LIMIT ?'
    ).bind(String(planId), bounded).all();
    return (result?.results || []).map((row) => {
      let detail = {};
      try { detail = JSON.parse(row.detail_json || '{}'); } catch { detail = { corrupt: true }; }
      return {
        event_id: String(row.event_id),
        event_type: String(row.event_type),
        detail,
        created_at: Number(row.created_at) || null,
      };
    });
  }

  async updateTask(planId, taskId, status, detail = {}) {
    const record = await this.loadRecord(planId);
    if (!record) throw planningError('WORK_PLAN_NOT_FOUND');
    if (record.work_dag_id) throw planningError('WORK_TASK_MANUAL_UPDATE_DENIED_AFTER_MATERIALIZATION');
    const task = record.tasks.find((candidate) => candidate.id === String(taskId));
    if (!task) throw planningError('WORK_TASK_NOT_FOUND');
    const next = String(status || '').toUpperCase();
    if (!Object.values(TASK_STATUSES).includes(next)) throw planningError('WORK_TASK_STATUS_INVALID');
    if (task.status === next) return publicRecord(record);
    if (!TASK_TRANSITIONS[task.status]?.has(next)) throw planningError('WORK_TASK_TRANSITION_INVALID');

    const now = Date.now();
    const previous = task.status;
    task.status = next;
    task.updated_at = now;
    record.status = derivePlanStatus(record.tasks);
    record.updated_at = now;

    const serialized = JSON.stringify(record);
    if (new TextEncoder().encode(serialized).length > MAX_RECORD_BYTES) throw planningError('WORK_PLAN_RECORD_TOO_LARGE');
    await this.db.prepare('UPDATE work_plans SET status=?,record_json=?,updated_at=? WHERE id=?')
      .bind(record.status, serialized, now, record.id).run();
    await this.appendEvent(record.id, 'TASK_STATUS_CHANGED', {
      task_id: task.id,
      from: previous,
      to: next,
      detail: detail && typeof detail === 'object' && !Array.isArray(detail) ? detail : {},
    });
    return publicRecord(record);
  }


  async syncFromWork(planId, dag) {
    const record = await this.loadRecord(planId);
    if (!record) throw planningError('WORK_PLAN_NOT_FOUND');
    if (!record.work_dag_id) throw planningError('WORK_PLAN_DAG_NOT_LINKED');
    if (!dag || dag.id !== record.work_dag_id || !Array.isArray(dag.nodes)) {
      throw planningError('WORK_PLAN_DAG_MISMATCH');
    }

    const statusMap = {
      PENDING: TASK_STATUSES.PENDING,
      RUNNING: TASK_STATUSES.RUNNING,
      WAITING_TEACHER: TASK_STATUSES.BLOCKED,
      COMPLETED: TASK_STATUSES.COMPLETED,
      FAILED: TASK_STATUSES.BLOCKED,
      BLOCKED: TASK_STATUSES.BLOCKED,
    };
    const now = Date.now();
    const changed = [];

    for (const task of record.tasks) {
      const node = dag.nodes.find((candidate) => candidate.id === task.id);
      if (!node) throw planningError('WORK_PLAN_DAG_TASK_MISMATCH');
      const next = statusMap[String(node.status || '')];
      if (!next) throw planningError('WORK_PLAN_DAG_STATUS_INVALID');
      if (task.status !== next) {
        changed.push({ task_id: task.id, from: task.status, to: next });
        task.status = next;
        task.updated_at = now;
      }
    }

    record.status = derivePlanStatus(record.tasks);
    record.updated_at = now;
    const serialized = JSON.stringify(record);
    if (new TextEncoder().encode(serialized).length > MAX_RECORD_BYTES) throw planningError('WORK_PLAN_RECORD_TOO_LARGE');
    await this.db.prepare('UPDATE work_plans SET status=?,record_json=?,updated_at=? WHERE id=?')
      .bind(record.status, serialized, now, record.id).run();
    await this.appendEvent(record.id, 'WORK_DAG_SYNCED', {
      work_dag_id: record.work_dag_id,
      work_status: String(dag.status || ''),
      changed,
    });
    return publicRecord(record);
  }

  async linkWorkDag(planId, workDagId) {
    const record = await this.loadRecord(planId);
    if (!record) throw planningError('WORK_PLAN_NOT_FOUND');
    const normalized = String(workDagId || '').trim().slice(0, 200);
    if (!normalized) throw planningError('WORK_DAG_ID_REQUIRED');
    if (record.work_dag_id && record.work_dag_id !== normalized) throw planningError('WORK_PLAN_DAG_ALREADY_LINKED');
    if (record.work_dag_id === normalized) return publicRecord(record);

    const now = Date.now();
    record.work_dag_id = normalized;
    record.updated_at = now;
    const serialized = JSON.stringify(record);
    await this.db.prepare('UPDATE work_plans SET work_dag_id=?,record_json=?,updated_at=? WHERE id=?')
      .bind(normalized, serialized, now, record.id).run();
    await this.appendEvent(record.id, 'WORK_DAG_LINKED', { work_dag_id: normalized });
    return publicRecord(record);
  }
}
