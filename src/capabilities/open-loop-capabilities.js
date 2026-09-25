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
    risk: 'LOW',
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
            resumeAt: Date.now() + 60000,
            nextAction: loop.nextAction || 'resume manually',
            metadata: { ...(loop.metadata || {}), resume_reason: 'WORK_DAG_ID_MISSING' },
          };
        }
        const result = await bus.execute('work.run', { id: workDagId }, context);
        const terminal = ['COMPLETED','BLOCKED'].includes(String(result?.status || '').toUpperCase());
        return {
          completed: String(result?.status || '').toUpperCase() === 'COMPLETED',
          status: terminal ? (String(result?.status || '').toUpperCase() === 'COMPLETED' ? 'completed' : 'waiting') : 'resumable',
          resumeAt: terminal ? 0 : Date.now() + 60000,
          checkpoint: { work: result },
          metadata: { ...(loop.metadata || {}), workDagId, last_work_status: result?.status || null },
        };
      },
    });
    return {
      ok: true,
      attempted: outcomes.length,
      succeeded: outcomes.filter(row => row.ok).length,
      failed: outcomes.filter(row => !row.ok).length,
      outcomes,
    };
  });
}
