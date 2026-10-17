import { createOpenLoopService } from '../conversations/open-loop-service.js';

function openLoopError(code, status = 400) {
  const error = new Error(code);
  error.code = code;
  error.status = status;
  return error;
}

function ownerFrom(context = {}, env = {}) {
  return String(context?.owner || env?.MELITURGOS_USER || '').trim();
}

export function registerOpenLoopCapabilities(bus, { env } = {}) {
  const runtimeEnv = env || {};
  const health = runtimeEnv.DB ? 'HEALTHY' : 'UNAVAILABLE';

  bus.discover({
    id: 'openloop.capture',
    name: 'Capturer un travail inachevé',
    category: 'work',
    version: '1.0.0',
    provider: 'mel',
    description: 'Persists one conversation-linked unfinished task/checkpoint so MEL can resume it later without losing context.',
    input_schema: {
      type: 'object',
      properties: {
        taskId: { type: 'string', minLength: 1, maxLength: 200 },
        conversationId: { type: 'string', minLength: 1, maxLength: 200 },
        sourceEventId: { type: 'string', maxLength: 200 },
        status: { type: 'string', enum: ['open','waiting','resumable','failed'] },
        priority: { type: 'integer', minimum: -100, maximum: 100 },
        nextAction: { type: 'string', maxLength: 2000 },
        resumeAt: { type: 'integer', minimum: 0 },
        checkpoint: { type: 'object', additionalProperties: true },
        metadata: { type: 'object', additionalProperties: true },
      },
      required: ['taskId','conversationId'],
      additionalProperties: false,
    },
    output_schema: { type: 'object', additionalProperties: true },
    risk: 'MEDIUM',
    permissions: [],
    health,
    enabled: true,
  }, async (input, context) => {
    if (!runtimeEnv.DB) throw openLoopError('DB_BINDING_MISSING', 503);
    const owner = ownerFrom(context, runtimeEnv);
    if (!owner) throw openLoopError('OPEN_LOOP_OWNER_REQUIRED', 403);
    return createOpenLoopService(runtimeEnv).capture({
      ...input,
      owner,
    });
  });

  bus.discover({
    id: 'openloop.due',
    name: 'Lister les travaux à reprendre',
    category: 'work',
    version: '1.0.0',
    provider: 'mel',
    description: 'Lists bounded due open loops for the current owner, ordered by priority and resume time.',
    input_schema: {
      type: 'object',
      properties: {
        limit: { type: 'integer', minimum: 1, maximum: 50 },
      },
      additionalProperties: false,
    },
    output_schema: { type: 'object', additionalProperties: true },
    risk: 'LOW',
    permissions: [],
    health,
    enabled: true,
  }, async (input, context) => {
    if (!runtimeEnv.DB) throw openLoopError('DB_BINDING_MISSING', 503);
    const owner = ownerFrom(context, runtimeEnv);
    if (!owner) throw openLoopError('OPEN_LOOP_OWNER_REQUIRED', 403);
    const service = createOpenLoopService(runtimeEnv);
    const loops = await service.store.listDue({
      owner,
      now: Date.now(),
      limit: Math.min(50, Math.max(1, Number(input?.limit) || 10)),
    });
    return { ok: true, count: loops.length, loops };
  });

  bus.discover({
    id: 'openloop.resume',
    name: 'Reprendre les travaux dus',
    category: 'work',
    version: '1.0.0',
    provider: 'mel',
    description: 'Claims due owner-scoped open loops once and resumes their linked Work DAG through work.run. Loops without a workDagId remain resumable and are not invented into another task.',
    input_schema: {
      type: 'object',
      properties: {
        limit: { type: 'integer', minimum: 1, maximum: 20 },
        retryDelayMs: { type: 'integer', minimum: 1000, maximum: 86400000 },
      },
      additionalProperties: false,
    },
    output_schema: { type: 'object', additionalProperties: true },
    risk: 'MEDIUM',
    permissions: [],
    health,
    enabled: true,
  }, async (input, context) => {
    if (!runtimeEnv.DB) throw openLoopError('DB_BINDING_MISSING', 503);
    const owner = ownerFrom(context, runtimeEnv);
    if (!owner) throw openLoopError('OPEN_LOOP_OWNER_REQUIRED', 403);
    const service = createOpenLoopService(runtimeEnv);
    const outcomes = await service.resumeDue({
      owner,
      limit: Math.min(20, Math.max(1, Number(input?.limit) || 5)),
      retryDelayMs: Math.max(1000, Number(input?.retryDelayMs) || 60000),
      execute: async (loop) => {
        const workDagId = String(loop?.metadata?.workDagId || '').trim();
        if (!workDagId) {
          return {
            status: 'resumable',
            advanced: false,
            deferred: true,
            resumeAt: Date.now() + 60000,
            nextAction: loop.nextAction || 'resume manually',
            metadata: { ...(loop.metadata || {}), resume_reason: 'WORK_DAG_ID_MISSING' },
          };
        }
        const claimedContext = {
          ...context,
          // Symbols cannot be supplied through client JSON. The owning resume
          // service commits this checkpoint via its lease-checked transaction.
          [Symbol.for('mel.core.openloop.claim')]: { workDagId, token: loop.leaseToken },
        };
        const result = await bus.execute('work.run', { id: workDagId, maxSteps: 1 }, claimedContext);
        const workStatus = String(result?.status || '').toUpperCase();
        const completed = workStatus === 'COMPLETED';
        const blocked = workStatus === 'BLOCKED';
        const deferred = result?.lease_busy === true;
        // A claimed open-loop and a successful capability call are *not*
        // proof that a Work node advanced. Compare verified checkpoints.
        const before = loop?.checkpoint?.work || {};
        const prior = Number(before?.node_counts?.COMPLETED ?? before?.completed_steps ?? 0);
        const after = Number(result?.node_counts?.COMPLETED);
        const stepAdvanced = result?.node_counts?.COMPLETED != null
          && Number.isFinite(prior) && Number.isFinite(after) && after > prior;
        const terminalAdvanced = completed && String(before?.status || '').toUpperCase() !== 'COMPLETED';
        const advanced = !deferred && result?.execution_started !== false && (stepAdvanced || terminalAdvanced);
        return {
          completed,
          advanced,
          deferred,
          status: completed ? 'completed' : blocked ? 'waiting' : 'resumable',
          resumeAt: completed ? 0 : blocked ? Number.MAX_SAFE_INTEGER : Date.now() + 60000,
          checkpoint: { work: result },
          metadata: { ...(loop.metadata || {}), workDagId, last_work_status: result?.status || null,
            last_work_advanced: advanced, last_work_deferred: deferred },
        };
      },
    });
    return {
      ok: true,
      attempted: outcomes.length,
      succeeded: outcomes.filter(row => row.ok).length,
      failed: outcomes.filter(row => !row.ok).length,
      advanced: outcomes.filter(row => row.advanced === true).length,
      deferred: outcomes.filter(row => row.deferred === true).length,
      outcomes,
    };
  });
}
