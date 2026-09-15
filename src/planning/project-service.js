import { port, requireValue } from '../core/contracts.js';

export const methods = [
  'createProject','getProject','listProjects','setProjectStatus',
  'recordDecision','getDecision','listDecisions','setDecisionStatus',
  'addLesson','getLesson','listLessons',
];

export const PROJECT_STATUSES = Object.freeze(['PLANNED','ACTIVE','PAUSED','COMPLETED','CANCELLED']);
export const DECISION_STATUSES = Object.freeze(['PROPOSED','ADOPTED','REJECTED','SUPERSEDED','REVERSED']);
export const createProjectService = adapters => port('planning.projects', methods, adapters);

const isRecord = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const nonEmptyString = value => typeof value === 'string' && value.trim().length > 0;
const clone = value => structuredClone(value);
const validTime = value => Number.isFinite(value);
const validMetadata = value => isRecord(value);

function normalizedStrings(values, code) {
  requireValue(Array.isArray(values), code, 400);
  const normalized = values.map(value => {
    requireValue(nonEmptyString(value), code, 400);
    return value.trim();
  });
  requireValue(new Set(normalized).size === normalized.length, code, 400);
  return normalized;
}

function normalizeStatusHistory(history, currentStatus, initialAt, allowedStatuses, code) {
  const value = history === undefined ? [{ status: currentStatus, changed_at: initialAt, reason: 'created' }] : history;
  requireValue(Array.isArray(value) && value.length > 0, code, 400);
  const normalized = value.map(entry => {
    requireValue(isRecord(entry) && allowedStatuses.includes(entry.status) && validTime(entry.changed_at), code, 400);
    requireValue(entry.reason === undefined || typeof entry.reason === 'string', code, 400);
    return {
      status: entry.status,
      changed_at: entry.changed_at,
      ...(entry.reason === undefined ? {} : { reason: entry.reason }),
    };
  });
  requireValue(normalized.at(-1).status === currentStatus, code, 400);
  for (let index = 1; index < normalized.length; index += 1) {
    requireValue(normalized[index].changed_at >= normalized[index - 1].changed_at, code, 400);
  }
  return normalized;
}

export function projectEntity(record) {
  requireValue(isRecord(record), 'PROJECT_INVALID', 400);
  requireValue(nonEmptyString(record.project_id), 'PROJECT_ID_INVALID', 400);
  requireValue(nonEmptyString(record.title), 'PROJECT_TITLE_INVALID', 400);
  requireValue(PROJECT_STATUSES.includes(record.status), 'PROJECT_STATUS_INVALID', 400);
  requireValue(validTime(record.created_at), 'PROJECT_CREATED_AT_INVALID', 400);
  requireValue(validTime(record.updated_at), 'PROJECT_UPDATED_AT_INVALID', 400);
  requireValue(record.updated_at >= record.created_at, 'PROJECT_TIME_RANGE_INVALID', 400);
  requireValue(validMetadata(record.metadata), 'PROJECT_METADATA_INVALID', 400);
  return clone({
    ...record,
    project_id: record.project_id.trim(),
    title: record.title.trim(),
    objectives: normalizedStrings(record.objectives, 'PROJECT_OBJECTIVES_INVALID'),
    status_history: normalizeStatusHistory(record.status_history, record.status, record.created_at, PROJECT_STATUSES, 'PROJECT_STATUS_HISTORY_INVALID'),
  });
}

export function decisionEntity(record) {
  requireValue(isRecord(record), 'DECISION_INVALID', 400);
  requireValue(nonEmptyString(record.decision_id), 'DECISION_ID_INVALID', 400);
  requireValue(nonEmptyString(record.project_id), 'DECISION_PROJECT_ID_INVALID', 400);
  requireValue(nonEmptyString(record.title), 'DECISION_TITLE_INVALID', 400);
  requireValue(typeof record.rationale === 'string', 'DECISION_RATIONALE_INVALID', 400);
  requireValue(DECISION_STATUSES.includes(record.status), 'DECISION_STATUS_INVALID', 400);
  requireValue(validTime(record.decided_at), 'DECISION_DECIDED_AT_INVALID', 400);
  requireValue(validTime(record.updated_at), 'DECISION_UPDATED_AT_INVALID', 400);
  requireValue(record.updated_at >= record.decided_at, 'DECISION_TIME_RANGE_INVALID', 400);
  requireValue(nonEmptyString(record.source), 'DECISION_SOURCE_INVALID', 400);
  requireValue(Number.isFinite(record.confidence) && record.confidence >= 0 && record.confidence <= 1, 'DECISION_CONFIDENCE_INVALID', 400);
  requireValue(validMetadata(record.metadata), 'DECISION_METADATA_INVALID', 400);
  return clone({
    ...record,
    decision_id: record.decision_id.trim(),
    project_id: record.project_id.trim(),
    title: record.title.trim(),
    source: record.source.trim(),
    status_history: normalizeStatusHistory(record.status_history, record.status, record.decided_at, DECISION_STATUSES, 'DECISION_STATUS_HISTORY_INVALID'),
  });
}

export function lessonEntity(record) {
  requireValue(isRecord(record), 'LESSON_INVALID', 400);
  requireValue(nonEmptyString(record.lesson_id), 'LESSON_ID_INVALID', 400);
  requireValue(nonEmptyString(record.project_id), 'LESSON_PROJECT_ID_INVALID', 400);
  requireValue(nonEmptyString(record.content), 'LESSON_CONTENT_INVALID', 400);
  requireValue(validTime(record.learned_at), 'LESSON_LEARNED_AT_INVALID', 400);
  requireValue(nonEmptyString(record.source), 'LESSON_SOURCE_INVALID', 400);
  requireValue(validMetadata(record.metadata), 'LESSON_METADATA_INVALID', 400);
  return clone({
    ...record,
    lesson_id: record.lesson_id.trim(),
    project_id: record.project_id.trim(),
    content: record.content.trim(),
    source: record.source.trim(),
  });
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

/** Reference adapter defining GEN2-13 semantics before durable persistence is wired. */
export function createInMemoryProjectAdapter(seed = {}) {
  requireValue(isRecord(seed), 'PLANNING_SEED_INVALID', 400);
  requireValue(seed.projects === undefined || Array.isArray(seed.projects), 'PLANNING_SEED_PROJECTS_INVALID', 400);
  requireValue(seed.decisions === undefined || Array.isArray(seed.decisions), 'PLANNING_SEED_DECISIONS_INVALID', 400);
  requireValue(seed.lessons === undefined || Array.isArray(seed.lessons), 'PLANNING_SEED_LESSONS_INVALID', 400);

  const projects = new Map();
  const decisions = new Map();
  const lessons = new Map();

  for (const candidate of seed.projects ?? []) {
    const project = projectEntity(candidate);
    requireValue(!projects.has(project.project_id), 'PROJECT_EXISTS', 409);
    projects.set(project.project_id, project);
  }
  for (const candidate of seed.decisions ?? []) {
    const decision = decisionEntity(candidate);
    requireValue(projects.has(decision.project_id), 'PROJECT_NOT_FOUND', 404);
    requireValue(!decisions.has(decision.decision_id), 'DECISION_EXISTS', 409);
    decisions.set(decision.decision_id, decision);
  }
  for (const candidate of seed.lessons ?? []) {
    const lesson = lessonEntity(candidate);
    requireValue(projects.has(lesson.project_id), 'PROJECT_NOT_FOUND', 404);
    requireValue(!lessons.has(lesson.lesson_id), 'LESSON_EXISTS', 409);
    lessons.set(lesson.lesson_id, lesson);
  }

  return Object.freeze({
    async createProject(input) {
      const project = projectEntity(input);
      requireValue(!projects.has(project.project_id), 'PROJECT_EXISTS', 409);
      projects.set(project.project_id, project);
      return clone(project);
    },

    async getProject(input = {}) {
      const projectId = requiredId(input, 'project_id', 'PROJECT_ID_INVALID');
      const project = projects.get(projectId);
      requireValue(project, 'PROJECT_NOT_FOUND', 404);
      return clone(project);
    },

    async listProjects(input = {}) {
      const query = listQuery(input, { statuses: PROJECT_STATUSES });
      const direction = query.order === 'asc' ? 1 : -1;
      return [...projects.values()]
        .filter(project => query.status === undefined || project.status === query.status)
        .sort((a, b) => direction * (a.created_at - b.created_at || a.project_id.localeCompare(b.project_id)))
        .slice(0, query.limit)
        .map(clone);
    },

    async setProjectStatus(input = {}) {
      const projectId = requiredId(input, 'project_id', 'PROJECT_ID_INVALID');
      requireValue(PROJECT_STATUSES.includes(input.status), 'PROJECT_STATUS_INVALID', 400);
      requireValue(validTime(input.changed_at), 'PROJECT_STATUS_TIME_INVALID', 400);
      requireValue(input.reason === undefined || typeof input.reason === 'string', 'PROJECT_STATUS_REASON_INVALID', 400);
      const project = projects.get(projectId);
      requireValue(project, 'PROJECT_NOT_FOUND', 404);
      requireValue(input.changed_at >= project.updated_at, 'PROJECT_STATUS_TIME_INVALID', 400);
      if (project.status === input.status) return clone(project);
      const updated = {
        ...project,
        status: input.status,
        updated_at: input.changed_at,
        status_history: [...project.status_history, {
          status: input.status,
          changed_at: input.changed_at,
          ...(input.reason === undefined ? {} : { reason: input.reason }),
        }],
      };
      projects.set(projectId, updated);
      return clone(updated);
    },

    async recordDecision(input) {
      const decision = decisionEntity(input);
      requireValue(projects.has(decision.project_id), 'PROJECT_NOT_FOUND', 404);
      requireValue(!decisions.has(decision.decision_id), 'DECISION_EXISTS', 409);
      decisions.set(decision.decision_id, decision);
      return clone(decision);
    },

    async getDecision(input = {}) {
      const decisionId = requiredId(input, 'decision_id', 'DECISION_ID_INVALID');
      const decision = decisions.get(decisionId);
      requireValue(decision, 'DECISION_NOT_FOUND', 404);
      return clone(decision);
    },

    async listDecisions(input = {}) {
      const query = listQuery(input, { statuses: DECISION_STATUSES });
      const direction = query.order === 'asc' ? 1 : -1;
      return [...decisions.values()]
        .filter(decision => query.project_id === undefined || decision.project_id === query.project_id)
        .filter(decision => query.status === undefined || decision.status === query.status)
        .sort((a, b) => direction * (a.decided_at - b.decided_at || a.decision_id.localeCompare(b.decision_id)))
        .slice(0, query.limit)
        .map(clone);
    },

    async setDecisionStatus(input = {}) {
      const decisionId = requiredId(input, 'decision_id', 'DECISION_ID_INVALID');
      requireValue(DECISION_STATUSES.includes(input.status), 'DECISION_STATUS_INVALID', 400);
      requireValue(validTime(input.changed_at), 'DECISION_STATUS_TIME_INVALID', 400);
      requireValue(input.reason === undefined || typeof input.reason === 'string', 'DECISION_STATUS_REASON_INVALID', 400);
      const decision = decisions.get(decisionId);
      requireValue(decision, 'DECISION_NOT_FOUND', 404);
      requireValue(input.changed_at >= decision.updated_at, 'DECISION_STATUS_TIME_INVALID', 400);
      if (decision.status === input.status) return clone(decision);
      const updated = {
        ...decision,
        status: input.status,
        updated_at: input.changed_at,
        status_history: [...decision.status_history, {
          status: input.status,
          changed_at: input.changed_at,
          ...(input.reason === undefined ? {} : { reason: input.reason }),
        }],
      };
      decisions.set(decisionId, updated);
      return clone(updated);
    },

    async addLesson(input) {
      const lesson = lessonEntity(input);
      requireValue(projects.has(lesson.project_id), 'PROJECT_NOT_FOUND', 404);
      requireValue(!lessons.has(lesson.lesson_id), 'LESSON_EXISTS', 409);
      lessons.set(lesson.lesson_id, lesson);
      return clone(lesson);
    },

    async getLesson(input = {}) {
      const lessonId = requiredId(input, 'lesson_id', 'LESSON_ID_INVALID');
      const lesson = lessons.get(lessonId);
      requireValue(lesson, 'LESSON_NOT_FOUND', 404);
      return clone(lesson);
    },

    async listLessons(input = {}) {
      const query = listQuery(input);
      const direction = query.order === 'asc' ? 1 : -1;
      return [...lessons.values()]
        .filter(lesson => query.project_id === undefined || lesson.project_id === query.project_id)
        .sort((a, b) => direction * (a.learned_at - b.learned_at || a.lesson_id.localeCompare(b.lesson_id)))
        .slice(0, query.limit)
        .map(clone);
    },
  });
}
