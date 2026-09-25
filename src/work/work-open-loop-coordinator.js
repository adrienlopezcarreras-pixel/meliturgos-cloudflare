const WORK_LOOP_KIND = 'work_dag';
const FAR_FUTURE = 253402300799000; // 9999-12-31T23:59:59Z

function text(value) {
  return String(value ?? '').trim();
}

function positiveInt(value, fallback, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(max, Math.trunc(parsed)));
}

export function workLoopTaskId(dagId) {
  const id = text(dagId);
  if (!id) throw new Error('WORK_OPEN_LOOP_DAG_ID_REQUIRED');
  return `work:${id}`;
}

function isWorkLoop(loop) {
  return loop?.metadata?.kind === WORK_LOOP_KIND
    && Boolean(text(loop?.metadata?.work_dag_id));
}

/**
 * Keeps durable Work DAGs visible to MEL's generic OpenLoopService and resumes
 * only loops explicitly tagged as Work DAGs. It never claims unrelated loops.
 */
export class WorkOpenLoopCoordinator {
  constructor({ openLoops, bus, now = () => Date.now() } = {}) {
    if (!openLoops || typeof openLoops.capture !== 'function' || typeof openLoops.resumeDue !== 'function') {
      throw new Error('WORK_OPEN_LOOP_SERVICE_REQUIRED');
    }
    if (!bus || typeof bus.execute !== 'function') {
      throw new Error('WORK_OPEN_LOOP_BUS_REQUIRED');
    }
    this.openLoops = openLoops;
    this.bus = bus;
    this.now = now;
  }

  async captureCreated({
    dagId,
    jobId = '',
    conversationId,
    owner,
    priority = 0,
  } = {}) {
    const workDagId = text(dagId);
    const conversation = text(conversationId);
    const normalizedOwner = text(owner);
    if (!workDagId) throw new Error('WORK_OPEN_LOOP_DAG_ID_REQUIRED');
    if (!conversation) throw new Error('WORK_OPEN_LOOP_CONVERSATION_REQUIRED');
    if (!normalizedOwner) throw new Error('WORK_OPEN_LOOP_OWNER_REQUIRED');

    return this.openLoops.capture({
      conversationId: conversation,
      taskId: workLoopTaskId(workDagId),
      owner: normalizedOwner,
      status: 'open',
      priority: Number.isFinite(Number(priority)) ? Number(priority) : 0,
      resumeAt: 0,
      nextAction: `Resume persistent Work DAG ${workDagId}`,
      checkpoint: {
        work_dag_id: workDagId,
        work_job_id: text(jobId) || workDagId,
        status: 'RUNNING',
      },
      metadata: {
        kind: WORK_LOOP_KIND,
        work_dag_id: workDagId,
        work_job_id: text(jobId) || workDagId,
      },
    });
  }

  async resumeDue({
    owner,
    context = {},
    limit = 10,
    retryDelayMs = 60_000,
    blockedRetryAt = FAR_FUTURE,
  } = {}) {
    const normalizedOwner = text(owner || context?.owner);
    if (!normalizedOwner) throw new Error('WORK_OPEN_LOOP_OWNER_REQUIRED');

    const retryDelay = positiveInt(retryDelayMs, 60_000, 86_400_000);
    const blockedAt = Number.isFinite(Number(blockedRetryAt))
      ? Math.max(this.now(), Number(blockedRetryAt))
      : FAR_FUTURE;

    return this.openLoops.resumeDue({
      owner: normalizedOwner,
      limit: positiveInt(limit, 10, 100),
      filter: isWorkLoop,
      retryDelayMs: retryDelay,
      execute: async (loop) => {
        const dagId = text(loop?.metadata?.work_dag_id);
        if (!dagId) throw new Error('WORK_OPEN_LOOP_DAG_ID_REQUIRED');

        const state = await this.bus.execute('work.run', { id: dagId }, {
          ...context,
          owner: normalizedOwner,
        });

        const checkpoint = {
          ...(loop.checkpoint || {}),
          work_dag_id: dagId,
          work_job_id: text(loop?.metadata?.work_job_id) || dagId,
          status: text(state?.status) || 'UNKNOWN',
          completed: state?.completed === true,
          blocked: state?.blocked === true,
          updated_at: state?.updated_at ?? null,
          checkpoint_count: state?.checkpoint_count ?? null,
          artifact_count: state?.artifact_count ?? null,
        };

        if (state?.completed === true) {
          return {
            completed: true,
            checkpoint,
            metadata: { last_work_status: text(state.status) || 'COMPLETED' },
          };
        }

        if (state?.blocked === true || text(state?.status).toUpperCase() === 'WAITING') {
          return {
            status: 'waiting',
            resumeAt: blockedAt,
            nextAction: `Resolve Work DAG ${dagId} blocker before automatic resume`,
            checkpoint,
            metadata: {
              last_work_status: text(state?.status) || 'BLOCKED',
              requires_intervention: true,
            },
          };
        }

        return {
          status: 'resumable',
          resumeAt: this.now() + retryDelay,
          nextAction: `Continue Work DAG ${dagId}`,
          checkpoint,
          metadata: { last_work_status: text(state?.status) || 'RUNNING' },
        };
      },
    });
  }
}

export const WORK_OPEN_LOOP_KIND = WORK_LOOP_KIND;
export const WORK_OPEN_LOOP_BLOCKED_RETRY_AT = FAR_FUTURE;
