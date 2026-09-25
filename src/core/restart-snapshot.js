function clamp(value, fallback = 20, max = 100) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(max, Math.trunc(parsed)));
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function text(value) {
  return String(value ?? '').trim();
}

function compactWork(row) {
  return {
    id: text(row?.id),
    job_id: text(row?.job_id),
    status: text(row?.status).toUpperCase(),
    created_at: Number(row?.created_at || 0) || null,
    updated_at: Number(row?.updated_at || 0) || null,
  };
}

function compactLoop(row) {
  return {
    id: text(row?.id),
    task_id: text(row?.task_id ?? row?.taskId),
    conversation_id: text(row?.conversation_id ?? row?.conversationId),
    status: text(row?.status).toLowerCase(),
    priority: Number(row?.priority || 0),
    next_action: text(row?.next_action ?? row?.nextAction),
    resume_at: Number(row?.resume_at ?? row?.resumeAt ?? 0),
    updated_at: Number(row?.updated_at ?? row?.updatedAt ?? 0),
    checkpoint: row?.checkpoint && typeof row.checkpoint === 'object' ? structuredClone(row.checkpoint) : {},
    metadata: row?.metadata && typeof row.metadata === 'object' ? structuredClone(row.metadata) : {},
  };
}

function activeProjects(rows) {
  const active = new Set(['PLANNED','ACTIVE','PAUSED']);
  return asArray(rows)
    .filter(row => active.has(text(row?.status).toUpperCase()))
    .map(row => ({
      project_id: text(row.project_id),
      title: text(row.title),
      status: text(row.status).toUpperCase(),
      objectives: asArray(row.objectives).slice(0, 20).map(text).filter(Boolean),
      updated_at: Number(row.updated_at || 0) || null,
      metadata: row?.metadata && typeof row.metadata === 'object' ? structuredClone(row.metadata) : {},
    }));
}

function compactDecisions(rows) {
  return asArray(rows).map(row => ({
    decision_id: text(row?.decision_id),
    project_id: text(row?.project_id),
    title: text(row?.title),
    status: text(row?.status).toUpperCase(),
    rationale: text(row?.rationale).slice(0, 2000),
    decided_at: Number(row?.decided_at || 0) || null,
    updated_at: Number(row?.updated_at || 0) || null,
    source: text(row?.source),
    confidence: Number.isFinite(row?.confidence) ? row.confidence : null,
  }));
}

function compactLessons(rows) {
  return asArray(rows).map(row => ({
    lesson_id: text(row?.lesson_id),
    project_id: text(row?.project_id),
    content: text(row?.content).slice(0, 3000),
    learned_at: Number(row?.learned_at || 0) || null,
    source: text(row?.source),
  }));
}

function compactTimeline(rows) {
  return asArray(rows).map(row => ({
    event_id: text(row?.event_id),
    type: text(row?.type),
    title: text(row?.title),
    description: text(row?.description).slice(0, 3000),
    occurred_at: Number(row?.occurred_at || 0) || null,
    source: text(row?.source),
    confidence: Number.isFinite(row?.confidence) ? row.confidence : null,
    metadata: row?.metadata && typeof row.metadata === 'object' ? structuredClone(row.metadata) : {},
  }));
}

function resumeQueue(work, loops) {
  const rows = [];
  for (const loop of loops) {
    rows.push({
      kind: 'open_loop',
      id: loop.id,
      status: loop.status,
      priority: loop.priority,
      next_action: loop.next_action,
      resume_at: loop.resume_at,
      updated_at: loop.updated_at,
      conversation_id: loop.conversation_id,
      task_id: loop.task_id,
    });
  }
  for (const item of work) {
    rows.push({
      kind: 'work_dag',
      id: item.id,
      status: item.status,
      priority: 0,
      next_action: item.status === 'WAITING'
        ? `Resolve blocker for Work DAG ${item.id}`
        : `Resume Work DAG ${item.id}`,
      resume_at: 0,
      updated_at: item.updated_at || 0,
      conversation_id: '',
      task_id: item.job_id || item.id,
    });
  }

  const statusRank = status => {
    const value = text(status).toLowerCase();
    if (value === 'resumable' || value === 'running') return 0;
    if (value === 'failed') return 1;
    if (value === 'waiting') return 2;
    if (value === 'open') return 3;
    if (value === 'resuming') return 4;
    return 5;
  };

  return rows
    .sort((a, b) =>
      (b.priority - a.priority)
      || (statusRank(a.status) - statusRank(b.status))
      || (a.resume_at - b.resume_at)
      || (b.updated_at - a.updated_at)
      || a.id.localeCompare(b.id)
    )
    .slice(0, 100);
}

/**
 * Read-only bounded reconstruction of MEL's durable state after a restart.
 * It never executes work and never mutates planning/memory state.
 */
export class CoreRestartSnapshot {
  constructor({
    workReader,
    openLoopReader,
    planning,
    timeline,
    now = () => Date.now(),
  } = {}) {
    if (!workReader || typeof workReader.open !== 'function') throw new Error('RESTART_WORK_READER_REQUIRED');
    if (!openLoopReader || typeof openLoopReader.listActive !== 'function') throw new Error('RESTART_OPEN_LOOP_READER_REQUIRED');
    if (!planning || typeof planning.listProjects !== 'function' || typeof planning.listDecisions !== 'function' || typeof planning.listLessons !== 'function') {
      throw new Error('RESTART_PLANNING_READER_REQUIRED');
    }
    if (!timeline || typeof timeline.list !== 'function') throw new Error('RESTART_TIMELINE_READER_REQUIRED');

    this.workReader = workReader;
    this.openLoopReader = openLoopReader;
    this.planning = planning;
    this.timeline = timeline;
    this.now = now;
  }

  async build({
    owner,
    workLimit = 25,
    openLoopLimit = 50,
    projectLimit = 50,
    decisionLimit = 50,
    lessonLimit = 50,
    timelineLimit = 100,
  } = {}) {
    const normalizedOwner = text(owner);
    if (!normalizedOwner) throw new Error('RESTART_OWNER_REQUIRED');

    const [workResult, loops, projects, decisions, lessons, timelineRows] = await Promise.all([
      this.workReader.open({ limit: clamp(workLimit, 25) }),
      this.openLoopReader.listActive({ owner: normalizedOwner, limit: clamp(openLoopLimit, 50) }),
      this.planning.listProjects({ limit: clamp(projectLimit, 50), order: 'desc' }),
      this.planning.listDecisions({ limit: clamp(decisionLimit, 50), order: 'desc' }),
      this.planning.listLessons({ limit: clamp(lessonLimit, 50), order: 'desc' }),
      this.timeline.list({ limit: clamp(timelineLimit, 100, 500), order: 'desc' }),
    ]);

    const openWork = asArray(workResult?.work ?? workResult).map(compactWork);
    const openLoops = asArray(loops).map(compactLoop);
    const activeProjectRows = activeProjects(projects);
    const recentDecisions = compactDecisions(decisions);
    const recentLessons = compactLessons(lessons);
    const recentTimeline = compactTimeline(timelineRows);

    return Object.freeze({
      schema: 'mel.restart-snapshot/v1',
      owner: normalizedOwner,
      generated_at: this.now(),
      counts: Object.freeze({
        open_work: openWork.length,
        open_loops: openLoops.length,
        active_projects: activeProjectRows.length,
        recent_decisions: recentDecisions.length,
        recent_lessons: recentLessons.length,
        recent_timeline: recentTimeline.length,
      }),
      resume_queue: Object.freeze(resumeQueue(openWork, openLoops)),
      open_work: Object.freeze(openWork),
      open_loops: Object.freeze(openLoops),
      active_projects: Object.freeze(activeProjectRows),
      recent_decisions: Object.freeze(recentDecisions),
      recent_lessons: Object.freeze(recentLessons),
      recent_timeline: Object.freeze(recentTimeline),
    });
  }
}

export function capabilityWorkReader(bus, context = {}) {
  if (!bus || typeof bus.execute !== 'function') throw new Error('RESTART_CAPABILITY_BUS_REQUIRED');
  return Object.freeze({
    open: input => bus.execute('work.open', input || {}, context),
  });
}
