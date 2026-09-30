import { DomainError, requireValue } from '../core/contracts.js';
import {
  DECISION_STATUSES,
  PROJECT_STATUSES,
  decisionEntity,
  lessonEntity,
  projectEntity,
} from './project-service.js';

function planningError(code, status = 500) {
  return new DomainError(code, status);
}

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function requiredId(input, key, code) {
  requireValue(isRecord(input) && nonEmptyString(input[key]), code, 400);
  return input[key].trim();
}

function listQuery(input = {}, { statuses = null } = {}) {
  requireValue(isRecord(input), 'PLANNING_QUERY_INVALID', 400);
  const { project_id, status, limit = 100, order = 'asc' } = input;
  requireValue(project_id === undefined || nonEmptyString(project_id), 'PLANNING_QUERY_PROJECT_ID_INVALID', 400);
  requireValue(status === undefined || (statuses && statuses.includes(status)), 'PLANNING_QUERY_STATUS_INVALID', 400);
  requireValue(Number.isInteger(limit) && limit > 0 && limit <= 500, 'PLANNING_QUERY_LIMIT_INVALID', 400);
  requireValue(order === 'asc' || order === 'desc', 'PLANNING_QUERY_ORDER_INVALID', 400);
  return {
    ...(project_id === undefined ? {} : { project_id: project_id.trim() }),
    ...(status === undefined ? {} : { status }),
    limit,
    order,
  };
}

function parseRecord(value, code) {
  try {
    const parsed = JSON.parse(value || '{}');
    if (!isRecord(parsed)) throw new Error('invalid');
    return parsed;
  } catch {
    throw planningError(code, 500);
  }
}

function projectFromRow(row) {
  return row ? projectEntity(parseRecord(row.record_json, 'PROJECT_RECORD_CORRUPT')) : null;
}

function decisionFromRow(row) {
  return row ? decisionEntity(parseRecord(row.record_json, 'DECISION_RECORD_CORRUPT')) : null;
}

function lessonFromRow(row) {
  return row ? lessonEntity(parseRecord(row.record_json, 'LESSON_RECORD_CORRUPT')) : null;
}

export class D1ProjectAdapter {
  constructor(db) {
    if (!db) throw planningError('PLANNING_DB_REQUIRED', 503);
    this.db = db;
    this._ready = false;
  }

  async ready() {
    if (this._ready) return this;

    await this.db.prepare(`CREATE TABLE IF NOT EXISTS mel_projects (
      project_id TEXT PRIMARY KEY,
      status TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      record_json TEXT NOT NULL
    )`).run();

    await this.db.prepare(`CREATE TABLE IF NOT EXISTS mel_decisions (
      decision_id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      status TEXT NOT NULL,
      decided_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      record_json TEXT NOT NULL
    )`).run();

    await this.db.prepare(`CREATE TABLE IF NOT EXISTS mel_lessons (
      lesson_id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      learned_at INTEGER NOT NULL,
      record_json TEXT NOT NULL
    )`).run();

    await this.db.prepare('CREATE INDEX IF NOT EXISTS idx_mel_projects_status_time ON mel_projects(status, created_at)').run();
    await this.db.prepare('CREATE INDEX IF NOT EXISTS idx_mel_decisions_project_status_time ON mel_decisions(project_id, status, decided_at)').run();
    await this.db.prepare('CREATE INDEX IF NOT EXISTS idx_mel_lessons_project_time ON mel_lessons(project_id, learned_at)').run();
    this._ready = true;
    return this;
  }

  async projectRow(projectId) {
    await this.ready();
    return this.db.prepare('SELECT * FROM mel_projects WHERE project_id=?').bind(projectId).first();
  }

  async decisionRow(decisionId) {
    await this.ready();
    return this.db.prepare('SELECT * FROM mel_decisions WHERE decision_id=?').bind(decisionId).first();
  }

  async lessonRow(lessonId) {
    await this.ready();
    return this.db.prepare('SELECT * FROM mel_lessons WHERE lesson_id=?').bind(lessonId).first();
  }

  async createProject(input) {
    await this.ready();
    const project = projectEntity(input);
    requireValue(!(await this.projectRow(project.project_id)), 'PROJECT_EXISTS', 409);

    try {
      await this.db.prepare(`INSERT INTO mel_projects(
        project_id, status, created_at, updated_at, record_json
      ) VALUES(?,?,?,?,?)`).bind(
        project.project_id,
        project.status,
        project.created_at,
        project.updated_at,
        JSON.stringify(project),
      ).run();
    } catch (error) {
      if (await this.projectRow(project.project_id)) throw planningError('PROJECT_EXISTS', 409);
      throw error;
    }
    return projectFromRow(await this.projectRow(project.project_id));
  }

  async getProject(input = {}) {
    const projectId = requiredId(input, 'project_id', 'PROJECT_ID_INVALID');
    const row = await this.projectRow(projectId);
    requireValue(row, 'PROJECT_NOT_FOUND', 404);
    return projectFromRow(row);
  }

  async listProjects(input = {}) {
    await this.ready();
    const query = listQuery(input, { statuses: PROJECT_STATUSES });
    const clauses = [];
    const args = [];
    if (query.status !== undefined) {
      clauses.push('status=?');
      args.push(query.status);
    }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const direction = query.order === 'desc' ? 'DESC' : 'ASC';
    const result = await this.db.prepare(
      `SELECT * FROM mel_projects ${where}
       ORDER BY created_at ${direction}, project_id ${direction} LIMIT ?`
    ).bind(...args, query.limit).all();
    return (result.results || []).map(projectFromRow);
  }

  async setProjectStatus(input = {}) {
    const projectId = requiredId(input, 'project_id', 'PROJECT_ID_INVALID');
    requireValue(PROJECT_STATUSES.includes(input.status), 'PROJECT_STATUS_INVALID', 400);
    requireValue(Number.isFinite(input.changed_at), 'PROJECT_STATUS_TIME_INVALID', 400);
    requireValue(input.reason === undefined || typeof input.reason === 'string', 'PROJECT_STATUS_REASON_INVALID', 400);

    const current = await this.getProject({ project_id: projectId });
    requireValue(input.changed_at >= current.updated_at, 'PROJECT_STATUS_TIME_INVALID', 400);
    if (current.status === input.status) return current;

    const updated = projectEntity({
      ...current,
      status: input.status,
      updated_at: input.changed_at,
      status_history: [...current.status_history, {
        status: input.status,
        changed_at: input.changed_at,
        ...(input.reason === undefined ? {} : { reason: input.reason }),
      }],
    });

    const result = await this.db.prepare(`UPDATE mel_projects
      SET status=?, updated_at=?, record_json=?
      WHERE project_id=? AND updated_at<=?`).bind(
      updated.status,
      updated.updated_at,
      JSON.stringify(updated),
      projectId,
      input.changed_at,
    ).run();
    requireValue(Boolean(result?.meta?.changes), 'PROJECT_STATUS_RACE_LOST', 409);
    return projectFromRow(await this.projectRow(projectId));
  }

  async recordDecision(input) {
    await this.ready();
    const decision = decisionEntity(input);
    requireValue(await this.projectRow(decision.project_id), 'PROJECT_NOT_FOUND', 404);
    requireValue(!(await this.decisionRow(decision.decision_id)), 'DECISION_EXISTS', 409);

    try {
      await this.db.prepare(`INSERT INTO mel_decisions(
        decision_id, project_id, status, decided_at, updated_at, record_json
      ) VALUES(?,?,?,?,?,?)`).bind(
        decision.decision_id,
        decision.project_id,
        decision.status,
        decision.decided_at,
        decision.updated_at,
        JSON.stringify(decision),
      ).run();
    } catch (error) {
      if (await this.decisionRow(decision.decision_id)) throw planningError('DECISION_EXISTS', 409);
      throw error;
    }
    return decisionFromRow(await this.decisionRow(decision.decision_id));
  }

  async getDecision(input = {}) {
    const decisionId = requiredId(input, 'decision_id', 'DECISION_ID_INVALID');
    const row = await this.decisionRow(decisionId);
    requireValue(row, 'DECISION_NOT_FOUND', 404);
    return decisionFromRow(row);
  }

  async listDecisions(input = {}) {
    await this.ready();
    const query = listQuery(input, { statuses: DECISION_STATUSES });
    const clauses = [];
    const args = [];
    if (query.project_id !== undefined) {
      clauses.push('project_id=?');
      args.push(query.project_id);
    }
    if (query.status !== undefined) {
      clauses.push('status=?');
      args.push(query.status);
    }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const direction = query.order === 'desc' ? 'DESC' : 'ASC';
    const result = await this.db.prepare(
      `SELECT * FROM mel_decisions ${where}
       ORDER BY decided_at ${direction}, decision_id ${direction} LIMIT ?`
    ).bind(...args, query.limit).all();
    return (result.results || []).map(decisionFromRow);
  }

  async setDecisionStatus(input = {}) {
    const decisionId = requiredId(input, 'decision_id', 'DECISION_ID_INVALID');
    requireValue(DECISION_STATUSES.includes(input.status), 'DECISION_STATUS_INVALID', 400);
    requireValue(Number.isFinite(input.changed_at), 'DECISION_STATUS_TIME_INVALID', 400);
    requireValue(input.reason === undefined || typeof input.reason === 'string', 'DECISION_STATUS_REASON_INVALID', 400);

    const current = await this.getDecision({ decision_id: decisionId });
    requireValue(input.changed_at >= current.updated_at, 'DECISION_STATUS_TIME_INVALID', 400);
    if (current.status === input.status) return current;

    const updated = decisionEntity({
      ...current,
      status: input.status,
      updated_at: input.changed_at,
      status_history: [...current.status_history, {
        status: input.status,
        changed_at: input.changed_at,
        ...(input.reason === undefined ? {} : { reason: input.reason }),
      }],
    });

    const result = await this.db.prepare(`UPDATE mel_decisions
      SET status=?, updated_at=?, record_json=?
      WHERE decision_id=? AND updated_at<=?`).bind(
      updated.status,
      updated.updated_at,
      JSON.stringify(updated),
      decisionId,
      input.changed_at,
    ).run();
    requireValue(Boolean(result?.meta?.changes), 'DECISION_STATUS_RACE_LOST', 409);
    return decisionFromRow(await this.decisionRow(decisionId));
  }

  async addLesson(input) {
    await this.ready();
    const lesson = lessonEntity(input);
    requireValue(await this.projectRow(lesson.project_id), 'PROJECT_NOT_FOUND', 404);
    requireValue(!(await this.lessonRow(lesson.lesson_id)), 'LESSON_EXISTS', 409);

    try {
      await this.db.prepare(`INSERT INTO mel_lessons(
        lesson_id, project_id, learned_at, record_json
      ) VALUES(?,?,?,?)`).bind(
        lesson.lesson_id,
        lesson.project_id,
        lesson.learned_at,
        JSON.stringify(lesson),
      ).run();
    } catch (error) {
      if (await this.lessonRow(lesson.lesson_id)) throw planningError('LESSON_EXISTS', 409);
      throw error;
    }
    return lessonFromRow(await this.lessonRow(lesson.lesson_id));
  }

  async getLesson(input = {}) {
    const lessonId = requiredId(input, 'lesson_id', 'LESSON_ID_INVALID');
    const row = await this.lessonRow(lessonId);
    requireValue(row, 'LESSON_NOT_FOUND', 404);
    return lessonFromRow(row);
  }

  async listLessons(input = {}) {
    await this.ready();
    const query = listQuery(input);
    const clauses = [];
    const args = [];
    if (query.project_id !== undefined) {
      clauses.push('project_id=?');
      args.push(query.project_id);
    }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const direction = query.order === 'desc' ? 'DESC' : 'ASC';
    const result = await this.db.prepare(
      `SELECT * FROM mel_lessons ${where}
       ORDER BY learned_at ${direction}, lesson_id ${direction} LIMIT ?`
    ).bind(...args, query.limit).all();
    return (result.results || []).map(lessonFromRow);
  }
}

export function createD1ProjectAdapter(db) {
  return new D1ProjectAdapter(db);
}
