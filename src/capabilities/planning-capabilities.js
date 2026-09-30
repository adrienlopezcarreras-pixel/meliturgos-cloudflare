import { createD1TimelineAdapter } from '../memory/d1-timeline.js';
import { createTimeline } from '../memory/timeline.js';
import { createD1ProjectAdapter } from '../planning/d1-project-service.js';
import { createProjectService } from '../planning/project-service.js';

function planningError(code, status) {
  const error = new Error(code);
  error.code = code;
  if (status) error.status = status;
  return error;
}

const STRING_ID = { type: 'string', minLength: 1, maxLength: 200 };
const STRING_4K = { type: 'string', minLength: 0, maxLength: 4000 };
const METADATA = { type: 'object', additionalProperties: true };
const STATUS_TIME = { type: 'number' };

function requireDb(db) {
  if (!db) throw planningError('PLANNING_DB_REQUIRED', 503);
}

function services(db) {
  requireDb(db);
  return {
    timeline: createTimeline(createD1TimelineAdapter(db)),
    projects: createProjectService(createD1ProjectAdapter(db)),
  };
}

function capability(bus, record, execute) {
  bus.discover({
    version: '1.0.0',
    provider: 'core',
    permissions: [],
    enabled: true,
    ...record,
  }, execute);
}

export function registerPlanningCapabilities(bus, { db } = {}) {
  const health = db ? 'HEALTHY' : 'UNAVAILABLE';

  capability(bus, {
    id: 'timeline.append', name: 'Ajouter un événement à la timeline', category: 'memory',
    description: 'Persists one immutable, provenance-bearing personal timeline event in D1.',
    input_schema: {
      type: 'object',
      properties: {
        event_id: STRING_ID, type: STRING_ID, title: { type: 'string', minLength: 1, maxLength: 500 },
        description: STRING_4K, occurred_at: STATUS_TIME, source: STRING_ID,
        confidence: { type: 'number', minimum: 0, maximum: 1 }, metadata: METADATA,
      },
      required: ['event_id','type','title','description','occurred_at','source','confidence','metadata'],
      additionalProperties: false,
    },
    output_schema: { type: 'object', additionalProperties: true },
    risk: 'MEDIUM', health,
  }, async input => services(db).timeline.append(input));

  capability(bus, {
    id: 'timeline.list', name: 'Lire la timeline', category: 'memory',
    description: 'Reads a bounded chronological slice of the durable personal timeline.',
    input_schema: {
      type: 'object',
      properties: {
        type: STRING_ID, source: STRING_ID, since: STATUS_TIME, until: STATUS_TIME,
        limit: { type: 'integer', minimum: 1, maximum: 500 },
        order: { type: 'string', enum: ['asc','desc'] },
      },
      additionalProperties: false,
    },
    output_schema: { type: 'array', items: { type: 'object', additionalProperties: true } },
    risk: 'LOW', health,
  }, async input => services(db).timeline.list(input));

  capability(bus, {
    id: 'timeline.get', name: 'Lire un événement de timeline', category: 'memory',
    description: 'Reads one durable timeline event by immutable identifier.',
    input_schema: { type: 'object', properties: { event_id: STRING_ID }, required: ['event_id'], additionalProperties: false },
    output_schema: { type: 'object', additionalProperties: true },
    risk: 'LOW', health,
  }, async input => services(db).timeline.get(input));

  capability(bus, {
    id: 'project.create', name: 'Créer un projet', category: 'planning',
    description: 'Creates one durable project with objectives, status history and metadata.',
    input_schema: {
      type: 'object',
      properties: {
        project_id: STRING_ID,
        title: { type: 'string', minLength: 1, maxLength: 500 },
        objectives: { type: 'array', items: { type: 'string', minLength: 1, maxLength: 1000 }, minItems: 0, maxItems: 100 },
        status: { type: 'string', enum: ['PLANNED','ACTIVE','PAUSED','COMPLETED','CANCELLED'] },
        created_at: STATUS_TIME, updated_at: STATUS_TIME, metadata: METADATA,
        status_history: { type: 'array', items: { type: 'object', additionalProperties: true }, maxItems: 500 },
      },
      required: ['project_id','title','objectives','status','created_at','updated_at','metadata'],
      additionalProperties: false,
    },
    output_schema: { type: 'object', additionalProperties: true },
    risk: 'MEDIUM', health,
  }, async input => services(db).projects.createProject(input));

  capability(bus, {
    id: 'project.get', name: 'Lire un projet', category: 'planning',
    description: 'Reads one durable project by identifier.',
    input_schema: { type: 'object', properties: { project_id: STRING_ID }, required: ['project_id'], additionalProperties: false },
    output_schema: { type: 'object', additionalProperties: true },
    risk: 'LOW', health,
  }, async input => services(db).projects.getProject(input));

  capability(bus, {
    id: 'project.list', name: 'Lister les projets', category: 'planning',
    description: 'Lists durable projects with optional status filter and deterministic ordering.',
    input_schema: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['PLANNED','ACTIVE','PAUSED','COMPLETED','CANCELLED'] },
        limit: { type: 'integer', minimum: 1, maximum: 500 },
        order: { type: 'string', enum: ['asc','desc'] },
      },
      additionalProperties: false,
    },
    output_schema: { type: 'array', items: { type: 'object', additionalProperties: true } },
    risk: 'LOW', health,
  }, async input => services(db).projects.listProjects(input));

  capability(bus, {
    id: 'project.status.set', name: 'Changer l’état d’un projet', category: 'planning',
    description: 'Persists an ordered project status transition using optimistic concurrency.',
    input_schema: {
      type: 'object',
      properties: {
        project_id: STRING_ID,
        status: { type: 'string', enum: ['PLANNED','ACTIVE','PAUSED','COMPLETED','CANCELLED'] },
        changed_at: STATUS_TIME,
        reason: STRING_4K,
      },
      required: ['project_id','status','changed_at'],
      additionalProperties: false,
    },
    output_schema: { type: 'object', additionalProperties: true },
    risk: 'MEDIUM', health,
  }, async input => services(db).projects.setProjectStatus(input));

  capability(bus, {
    id: 'decision.record', name: 'Enregistrer une décision', category: 'planning',
    description: 'Records a durable project decision with rationale, provenance and confidence.',
    input_schema: {
      type: 'object',
      properties: {
        decision_id: STRING_ID, project_id: STRING_ID,
        title: { type: 'string', minLength: 1, maxLength: 500 },
        rationale: STRING_4K,
        status: { type: 'string', enum: ['PROPOSED','ADOPTED','REJECTED','SUPERSEDED','REVERSED'] },
        decided_at: STATUS_TIME, updated_at: STATUS_TIME, source: STRING_ID,
        confidence: { type: 'number', minimum: 0, maximum: 1 }, metadata: METADATA,
        status_history: { type: 'array', items: { type: 'object', additionalProperties: true }, maxItems: 500 },
      },
      required: ['decision_id','project_id','title','rationale','status','decided_at','updated_at','source','confidence','metadata'],
      additionalProperties: false,
    },
    output_schema: { type: 'object', additionalProperties: true },
    risk: 'MEDIUM', health,
  }, async input => services(db).projects.recordDecision(input));

  capability(bus, {
    id: 'decision.get', name: 'Lire une décision', category: 'planning',
    description: 'Reads one durable project decision by identifier.',
    input_schema: { type: 'object', properties: { decision_id: STRING_ID }, required: ['decision_id'], additionalProperties: false },
    output_schema: { type: 'object', additionalProperties: true },
    risk: 'LOW', health,
  }, async input => services(db).projects.getDecision(input));

  capability(bus, {
    id: 'decision.list', name: 'Lister les décisions', category: 'planning',
    description: 'Lists durable decisions, optionally filtered by project or status.',
    input_schema: {
      type: 'object',
      properties: {
        project_id: STRING_ID,
        status: { type: 'string', enum: ['PROPOSED','ADOPTED','REJECTED','SUPERSEDED','REVERSED'] },
        limit: { type: 'integer', minimum: 1, maximum: 500 },
        order: { type: 'string', enum: ['asc','desc'] },
      },
      additionalProperties: false,
    },
    output_schema: { type: 'array', items: { type: 'object', additionalProperties: true } },
    risk: 'LOW', health,
  }, async input => services(db).projects.listDecisions(input));

  capability(bus, {
    id: 'decision.status.set', name: 'Changer l’état d’une décision', category: 'planning',
    description: 'Persists an ordered decision status transition using optimistic concurrency.',
    input_schema: {
      type: 'object',
      properties: {
        decision_id: STRING_ID,
        status: { type: 'string', enum: ['PROPOSED','ADOPTED','REJECTED','SUPERSEDED','REVERSED'] },
        changed_at: STATUS_TIME,
        reason: STRING_4K,
      },
      required: ['decision_id','status','changed_at'],
      additionalProperties: false,
    },
    output_schema: { type: 'object', additionalProperties: true },
    risk: 'MEDIUM', health,
  }, async input => services(db).projects.setDecisionStatus(input));

  capability(bus, {
    id: 'lesson.add', name: 'Ajouter une leçon de projet', category: 'planning',
    description: 'Persists one durable lesson linked to an existing project.',
    input_schema: {
      type: 'object',
      properties: {
        lesson_id: STRING_ID, project_id: STRING_ID,
        content: { type: 'string', minLength: 1, maxLength: 12000 },
        learned_at: STATUS_TIME, source: STRING_ID, metadata: METADATA,
      },
      required: ['lesson_id','project_id','content','learned_at','source','metadata'],
      additionalProperties: false,
    },
    output_schema: { type: 'object', additionalProperties: true },
    risk: 'MEDIUM', health,
  }, async input => services(db).projects.addLesson(input));

  capability(bus, {
    id: 'lesson.get', name: 'Lire une leçon de projet', category: 'planning',
    description: 'Reads one durable project lesson by identifier.',
    input_schema: { type: 'object', properties: { lesson_id: STRING_ID }, required: ['lesson_id'], additionalProperties: false },
    output_schema: { type: 'object', additionalProperties: true },
    risk: 'LOW', health,
  }, async input => services(db).projects.getLesson(input));

  capability(bus, {
    id: 'lesson.list', name: 'Lister les leçons de projet', category: 'planning',
    description: 'Lists durable lessons, optionally filtered by project.',
    input_schema: {
      type: 'object',
      properties: {
        project_id: STRING_ID,
        limit: { type: 'integer', minimum: 1, maximum: 500 },
        order: { type: 'string', enum: ['asc','desc'] },
      },
      additionalProperties: false,
    },
    output_schema: { type: 'array', items: { type: 'object', additionalProperties: true } },
    risk: 'LOW', health,
  }, async input => services(db).projects.listLessons(input));
}
