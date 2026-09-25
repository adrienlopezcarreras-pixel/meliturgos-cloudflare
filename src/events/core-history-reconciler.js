function text(value) {
  return String(value ?? '').trim();
}

function bounded(value, fallback = 100, max = 500) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(max, Math.trunc(parsed)));
}

function eventId(...parts) {
  return parts.map(part => text(part).replace(/[^a-zA-Z0-9._:-]+/g, '_')).filter(Boolean).join(':');
}

function eventRecord({
  id,
  topic,
  source,
  payload,
  createdAt,
  correlationId = '',
  causationId = '',
}) {
  return {
    event_id: id,
    topic,
    source,
    idempotency_key: id,
    payload,
    created_at: Number(createdAt),
    ...(text(correlationId) ? { correlation_id: text(correlationId) } : {}),
    ...(text(causationId) ? { causation_id: text(causationId) } : {}),
    metadata: { reconciled_from_durable_history: true },
  };
}

function publishResult(result, record) {
  return {
    event_id: record.event_id,
    topic: record.topic,
    deduplicated: result?.deduplicated === true,
  };
}

function projectEvents(project) {
  const rows = [];
  const projectId = text(project?.project_id);
  if (!projectId) return rows;

  const createdAt = Number(project.created_at);
  if (Number.isFinite(createdAt)) {
    rows.push(eventRecord({
      id: eventId('project', projectId, 'created', createdAt),
      topic: 'project.created',
      source: 'planning.projects',
      createdAt,
      payload: {
        project_id: projectId,
        title: text(project.title),
        status: text(project.status),
        objectives: Array.isArray(project.objectives) ? project.objectives.slice(0, 50).map(text) : [],
        occurred_at: createdAt,
      },
    }));
  }

  const history = Array.isArray(project?.status_history) ? project.status_history : [];
  for (let index = 0; index < history.length; index += 1) {
    const row = history[index];
    const changedAt = Number(row?.changed_at);
    if (!Number.isFinite(changedAt)) continue;
    if (index === 0 && changedAt === createdAt && text(row?.reason) === 'created') continue;
    rows.push(eventRecord({
      id: eventId('project', projectId, 'status', index, changedAt, row?.status),
      topic: 'project.status',
      source: 'planning.projects',
      createdAt: changedAt,
      causationId: rows[rows.length - 1]?.event_id || '',
      payload: {
        project_id: projectId,
        title: text(project.title),
        status: text(row?.status),
        reason: text(row?.reason),
        changed_at: changedAt,
      },
    }));
  }
  return rows;
}

function decisionEvents(decision) {
  const rows = [];
  const decisionId = text(decision?.decision_id);
  const projectId = text(decision?.project_id);
  if (!decisionId || !projectId) return rows;

  const decidedAt = Number(decision.decided_at);
  if (Number.isFinite(decidedAt)) {
    rows.push(eventRecord({
      id: eventId('decision', decisionId, 'recorded', decidedAt),
      topic: 'decision.recorded',
      source: 'planning.projects',
      createdAt: decidedAt,
      correlationId: eventId('project', projectId),
      payload: {
        decision_id: decisionId,
        project_id: projectId,
        title: text(decision.title),
        rationale: text(decision.rationale).slice(0, 6000),
        status: text(decision.status),
        decided_at: decidedAt,
        source: text(decision.source),
        confidence: Number.isFinite(decision.confidence) ? decision.confidence : 1,
      },
    }));
  }

  const history = Array.isArray(decision?.status_history) ? decision.status_history : [];
  for (let index = 0; index < history.length; index += 1) {
    const row = history[index];
    const changedAt = Number(row?.changed_at);
    if (!Number.isFinite(changedAt)) continue;
    if (index === 0 && changedAt === decidedAt && text(row?.reason) === 'created') continue;
    rows.push(eventRecord({
      id: eventId('decision', decisionId, 'status', index, changedAt, row?.status),
      topic: 'decision.status',
      source: 'planning.projects',
      createdAt: changedAt,
      correlationId: eventId('project', projectId),
      causationId: rows[rows.length - 1]?.event_id || '',
      payload: {
        decision_id: decisionId,
        project_id: projectId,
        title: text(decision.title),
        status: text(row?.status),
        reason: text(row?.reason),
        changed_at: changedAt,
      },
    }));
  }
  return rows;
}

function lessonEvent(lesson) {
  const lessonId = text(lesson?.lesson_id);
  const projectId = text(lesson?.project_id);
  const learnedAt = Number(lesson?.learned_at);
  if (!lessonId || !projectId || !Number.isFinite(learnedAt)) return null;
  return eventRecord({
    id: eventId('lesson', lessonId, 'added', learnedAt),
    topic: 'lesson.added',
    source: 'planning.projects',
    createdAt: learnedAt,
    correlationId: eventId('project', projectId),
    payload: {
      lesson_id: lessonId,
      project_id: projectId,
      content: text(lesson.content).slice(0, 6000),
      learned_at: learnedAt,
      source: text(lesson.source),
    },
  });
}

const WORK_AUDIT_TOPIC = Object.freeze({
  WORK_DAG_CREATED: 'work.created',
  WORK_NODE_STARTED: 'work.running',
  WORK_NODE_WAITING_TEACHER: 'work.waiting',
  WORK_NODE_RECOVERED_FOR_RETRY: 'work.resumable',
  WORK_DAG_COMPLETED: 'work.completed',
  WORK_NODE_FAILED: 'work.failed',
  WORK_DAG_FAIL_CLOSED_ON_INTERRUPTED_NODE: 'work.failed',
  WORK_DAG_NO_RUNNABLE_NODE: 'work.failed',
  WORK_TEACHER_REVIEW_BLOCKED: 'work.failed',
});

function workAuditEvents(dag) {
  const dagId = text(dag?.id);
  if (!dagId) return [];
  const jobId = text(dag?.job_id);
  const audit = Array.isArray(dag?.audit) ? dag.audit : [];
  const rows = [];

  for (let index = 0; index < audit.length; index += 1) {
    const entry = audit[index];
    const auditName = text(entry?.event).toUpperCase();
    const topic = WORK_AUDIT_TOPIC[auditName];
    const at = Number(entry?.at);
    if (!topic || !Number.isFinite(at)) continue;

    const id = eventId('work', dagId, 'audit', index, auditName, at);
    rows.push(eventRecord({
      id,
      topic,
      source: 'work-engine',
      createdAt: at,
      correlationId: eventId('work', dagId),
      causationId: rows[rows.length - 1]?.event_id || '',
      payload: {
        work_dag_id: dagId,
        job_id: jobId || dagId,
        status: text(dag.status),
        audit_event: auditName,
        occurred_at: at,
        node_id: text(entry?.node_id),
        kind: text(entry?.kind),
        attempt: Number.isFinite(Number(entry?.attempt)) ? Number(entry.attempt) : undefined,
        code: text(entry?.code),
        request_id: text(entry?.request_id),
        verdict: text(entry?.verdict),
      },
    }));
  }
  return rows;
}

export class CoreHistoryEventReconciler {
  constructor({ eventBus, planning = null, workHistory = null } = {}) {
    if (!eventBus || typeof eventBus.publish !== 'function') {
      throw new Error('HISTORY_RECONCILER_EVENT_BUS_REQUIRED');
    }
    this.eventBus = eventBus;
    this.planning = planning;
    this.workHistory = workHistory;
  }

  async publish(records) {
    const results = [];
    for (const record of records) {
      const published = await this.eventBus.publish(record);
      results.push(publishResult(published, record));
    }
    return results;
  }

  async reconcilePlanning({ limit = 500 } = {}) {
    if (!this.planning
      || typeof this.planning.listProjects !== 'function'
      || typeof this.planning.listDecisions !== 'function'
      || typeof this.planning.listLessons !== 'function') {
      throw new Error('HISTORY_RECONCILER_PLANNING_REQUIRED');
    }

    const capped = bounded(limit, 500, 500);
    const [projects, decisions, lessons] = await Promise.all([
      this.planning.listProjects({ limit: capped, order: 'asc' }),
      this.planning.listDecisions({ limit: capped, order: 'asc' }),
      this.planning.listLessons({ limit: capped, order: 'asc' }),
    ]);

    const records = [];
    for (const project of projects || []) records.push(...projectEvents(project));
    for (const decision of decisions || []) records.push(...decisionEvents(decision));
    for (const lesson of lessons || []) {
      const record = lessonEvent(lesson);
      if (record) records.push(record);
    }

    records.sort((a, b) => a.created_at - b.created_at || a.event_id.localeCompare(b.event_id));
    const published = await this.publish(records);
    return {
      scanned: {
        projects: projects?.length || 0,
        decisions: decisions?.length || 0,
        lessons: lessons?.length || 0,
      },
      emitted: published.length,
      deduplicated: published.filter(row => row.deduplicated).length,
      events: published,
    };
  }

  async reconcileWork({ limit = 100 } = {}) {
    if (!this.workHistory || typeof this.workHistory.list !== 'function' || typeof this.workHistory.load !== 'function') {
      throw new Error('HISTORY_RECONCILER_WORK_REQUIRED');
    }

    const index = await this.workHistory.list({ limit: bounded(limit, 100, 100) });
    const workRows = Array.isArray(index?.work) ? index.work : Array.isArray(index) ? index : [];
    const records = [];

    for (const row of workRows) {
      const id = text(row?.id);
      if (!id) continue;
      const dag = await this.workHistory.load(id);
      if (dag) records.push(...workAuditEvents(dag));
    }

    records.sort((a, b) => a.created_at - b.created_at || a.event_id.localeCompare(b.event_id));
    const published = await this.publish(records);
    return {
      scanned: { work_dags: workRows.length },
      emitted: published.length,
      deduplicated: published.filter(row => row.deduplicated).length,
      events: published,
    };
  }

  async reconcileAll(options = {}) {
    const planning = this.planning
      ? await this.reconcilePlanning({ limit: options.planningLimit })
      : null;
    const work = this.workHistory
      ? await this.reconcileWork({ limit: options.workLimit })
      : null;
    return { planning, work };
  }
}

export const WORK_HISTORY_EVENT_TOPICS = WORK_AUDIT_TOPIC;
