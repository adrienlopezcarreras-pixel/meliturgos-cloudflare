async function sampleRead(runtime, context, id, input = {}) {
  const result = await runtime.bus.execute(id, input, {
    owner: context?.owner || 'capability-audit',
    permissions: context?.permissions || [],
    requestId: context?.requestId || crypto.randomUUID(),
  });
  return result;
}

function firstArray(value, ...paths) {
  if (Array.isArray(value)) return value;
  for (const path of paths) {
    if (!path) continue;
    let cursor = value;
    for (const key of path.split('.')) cursor = cursor?.[key];
    if (Array.isArray(cursor)) return cursor;
  }
  return [];
}

const SAFE_SAMPLES = Object.freeze({
  echo: { value: 'capability-audit' },
  'roadmap.read': {},
  'system.bindings': {},
  'chatgpt.archive.preview': { archive: { conversations: [] } },
  'capability.audit': { deep: false },
  'code.read': { path: 'package.json' },
  'code.search': { query: 'MELITURGOS' },
  'code.integrity': { paths: ['src/index.js', 'src/api/native-chat.js', 'package.json'] },
  'conversation.list': {},
  'rag.search': { query: 'MELITURGOS', limit: 1 },
  'autonomy.status': {},
  'mentor.recent': { limit: 1 },
  'evolution.gap.detect': { goal: 'rechercher des informations récentes sur le web', threshold: 2 },
  'evolution.module.propose': { goal: 'prévisualiser une capacité locale de diagnostic sans écrire ni activer de code', threshold: 2 },
  'device.policy.preview': { deviceId: 'audit-preview', capabilities: ['status.read'], action: 'status.read', ownerApproved: false, ownerShutdown: false, adapter: 'audit-preview' },
  'web.research': { query: 'Cloudflare Workers documentation', depth: 1 },

  // Bounded read-only production probes. These samples intentionally avoid
  // mutations and use tiny result windows so the persistent stress can prove
  // real execution instead of stopping at contract inspection.
  'github.repository.read': {},
  'github.actions.runs.read': { limit: 1 },
  'cloudflare.workers.read': {},
  'cloudflare.deployments.read': {},
  'gmail.messages.search': { query: 'newer_than:1d', limit: 1 },
  'calendar.events.read': { limit: 1 },
  'tasks.tasklists.read': { limit: 1 },
  'mail.messages.search': { limit: 1 },
  'files.list': { limit: 1 },
  'files.search': { query: 'mel', limit: 1 },
  'drive.files.list': { limit: 1 },
  'drive.files.search': { query: 'mel', limit: 1 },
  'sites.list': { limit: 1 },
  'sites.search': { query: 'mel', limit: 1 },
  'roadmap.human-actions-required': {},
  'system.integrity': {},
  'system.maturity': {},
  'chatgpt.history.search': { query: 'MELITURGOS', limit: 1 },
  'computer.status': {},
  'work.plan.list': { limit: 1 },
  'openloop.due': { limit: 1 },
  'timeline.list': { limit: 1 },
  'project.list': { limit: 1 },
  'decision.list': { limit: 1 },
  'lesson.list': { limit: 1 },
  'skill.list': { active_only: true },
  'skill.snapshot.export': {},
  'self.audit.status': {},
  'memory.status': {},
  'knowledge.search': { query: 'MELITURGOS', limit: 1 },
  'evolution.ledger.list': { limit: 1 },
  'evolution.ledger.verify': { limit: 50 },
  'resilience.recovery.drill.latest': {},
  'resilience.cold-standby.prepare.latest': {},
  'event.list': { limit: 1 },
  'self.state': {},
  'presentation.layout.plan': { kind: 'chat' },
  'work.plan': {
    goal: 'Audit borné sans effet de bord',
    steps: [{ id: 'step-1', title: 'Lire la roadmap', capability: 'roadmap.read', input: {}, dependsOn: [], idempotent: true }],
  },

  // Dynamic read-only fixtures: derive a real identifier from a bounded list
  // instead of inventing IDs that would create false runtime failures.
  'gmail.messages.read': async ({ runtime, context }) => {
    const result = await sampleRead(runtime, context, 'gmail.messages.search', { query: 'newer_than:30d', limit: 1 });
    const id = firstArray(result, 'messages')[0]?.id;
    return id ? { message_id: String(id) } : undefined;
  },
  'tasks.tasks.read': async ({ runtime, context }) => {
    const result = await sampleRead(runtime, context, 'tasks.tasklists.read', { limit: 1 });
    const id = firstArray(result, 'tasklists')[0]?.id;
    return id ? { tasklist_id: String(id), limit: 1 } : undefined;
  },
  'mail.messages.read': async ({ runtime, context }) => {
    const result = await sampleRead(runtime, context, 'mail.messages.search', { limit: 1 });
    const id = firstArray(result, 'messages')[0]?.id;
    return id ? { message_id: String(id) } : undefined;
  },
  'files.read': async ({ runtime, context }) => {
    const result = await sampleRead(runtime, context, 'files.list', { limit: 1 });
    const id = firstArray(result, 'files')[0]?.id;
    return id ? { file_id: String(id), include_content: false } : undefined;
  },
  'drive.files.read': async ({ runtime, context }) => {
    const result = await sampleRead(runtime, context, 'drive.files.list', { limit: 1 });
    const id = firstArray(result, 'files')[0]?.id;
    return id ? { file_id: String(id), include_content: false } : undefined;
  },
  'sites.read': async ({ runtime, context }) => {
    const result = await sampleRead(runtime, context, 'sites.list', { limit: 1 });
    const id = firstArray(result, 'sites')[0]?.id;
    return id ? { site_id: String(id) } : undefined;
  },
  'timeline.get': async ({ runtime, context }) => {
    const rows = await sampleRead(runtime, context, 'timeline.list', { limit: 1 });
    const id = firstArray(rows, '')[0]?.event_id;
    return id ? { event_id: String(id) } : undefined;
  },
  'project.get': async ({ runtime, context }) => {
    const rows = await sampleRead(runtime, context, 'project.list', { limit: 1 });
    const id = firstArray(rows, '')[0]?.project_id;
    return id ? { project_id: String(id) } : undefined;
  },
  'decision.get': async ({ runtime, context }) => {
    const rows = await sampleRead(runtime, context, 'decision.list', { limit: 1 });
    const id = firstArray(rows, '')[0]?.decision_id;
    return id ? { decision_id: String(id) } : undefined;
  },
  'lesson.get': async ({ runtime, context }) => {
    const rows = await sampleRead(runtime, context, 'lesson.list', { limit: 1 });
    const id = firstArray(rows, '')[0]?.lesson_id;
    return id ? { lesson_id: String(id) } : undefined;
  },
  'event.get': async ({ runtime, context }) => {
    const result = await sampleRead(runtime, context, 'event.list', { limit: 1 });
    const id = firstArray(result, 'events', 'items')[0]?.event_id;
    return id ? { event_id: String(id) } : undefined;
  },
  'skill.resolve': async ({ runtime, context }) => {
    const rows = await sampleRead(runtime, context, 'skill.list', { active_only: true });
    const row = firstArray(rows, '')[0];
    return row?.skill_id ? { skill_id: String(row.skill_id), version: row.version ? String(row.version) : undefined } : undefined;
  },
  'skill.history': async ({ runtime, context }) => {
    const rows = await sampleRead(runtime, context, 'skill.list', { active_only: true });
    const row = firstArray(rows, '')[0];
    return row?.skill_id ? { skill_id: String(row.skill_id) } : undefined;
  },
  'work.plan.get': async ({ runtime, context }) => {
    const result = await sampleRead(runtime, context, 'work.plan.list', { limit: 1 });
    const id = firstArray(result, 'plans')[0]?.id;
    return id ? { id: String(id) } : undefined;
  },
  'work.plan.history': async ({ runtime, context }) => {
    const result = await sampleRead(runtime, context, 'work.plan.list', { limit: 1 });
    const id = firstArray(result, 'plans')[0]?.id;
    return id ? { id: String(id), limit: 1 } : undefined;
  },
  'conversation.get': async ({ runtime, context }) => {
    const rows = await sampleRead(runtime, context, 'conversation.list', {});
    const row = firstArray(rows, '')[0];
    return row?.id ? { id: String(row.id) } : undefined;
  },
  'conversation.messages.list': async ({ runtime, context }) => {
    const rows = await sampleRead(runtime, context, 'conversation.list', {});
    const row = firstArray(rows, '')[0];
    return row?.id ? { conversationId: String(row.id), limit: 1 } : undefined;
  },
  'knowledge.file.read': async ({ runtime, context }) => {
    const result = await sampleRead(runtime, context, 'knowledge.search', { query: 'MELITURGOS', limit: 1 });
    const row = firstArray(result, 'artifacts')[0];
    return row?.id ? { id: String(row.id) } : row?.filename ? { filename: String(row.filename) } : undefined;
  },
});

// Automatic deep audits must be zero-added-cost by proof, not assumption.
// This includes obvious external/provider calls and reads backed by metered
// Cloudflare resources such as D1. A capability in this set may still be
// executed when the caller explicitly supplies its exact id in
// zeroCostCapabilityIds for the current run.
const COST_SENSITIVE_CAPABILITIES = new Set([
  'augmentio.fanout',
  'model.council',
  'council.state-of-play',
  'evolution.preflight',
  'work.plan.generate',
  'media.audio.transcribe',
  'evolution.enqueue',
  'web.research',
  'code.read',
  'code.search',
  'code.integrity',
  'conversation.list',
  'rag.search',
  'autonomy.status',
  'mentor.recent',
]);

const DECLARED_IMPLEMENTATION_STATUSES = new Set([
  'IMPLEMENTED',
  'PARTIAL',
  'STUB',
  'NOT_IMPLEMENTED',
]);

export function declaredImplementationStatus(record) {
  const raw = String(record?.implementation_status || '').trim().toUpperCase();
  return DECLARED_IMPLEMENTATION_STATUSES.has(raw) ? raw : null;
}

/**
 * Single source of truth for capability claims exposed to diagnostics and chat.
 * A HEALTHY registration without a current execution proof stays explicitly
 * EXISTANT_NON_TESTE; only a successful execution may become EXISTANT_ET_TESTE.
 */
export function classifyCapabilityTruth(record, execution = null) {
  const declared = declaredImplementationStatus(record);
  if (declared === 'STUB') return 'STUB';
  if (declared === 'NOT_IMPLEMENTED') return 'NOT_IMPLEMENTED';
  if (record?.enabled === false) return 'BLOCKED';
  if (String(record?.health || '').toUpperCase() === 'UNAVAILABLE') return 'BLOCKED_EXTERNAL';
  if (execution?.ok) return 'EXISTANT_ET_TESTE';
  if (execution && !execution.ok) return 'EXISTANT_MAIS_ECHEC_RUNTIME';
  if (declared === 'PARTIAL') return 'PARTIEL';
  const health = String(record?.health || '').toUpperCase();
  if (health === 'HEALTHY') return 'EXISTANT_NON_TESTE';
  if (health === 'DEGRADED') return 'PARTIEL';
  return 'EXISTANT_NON_TESTE';
}

function autoExecutionBlockReason({ deep, record, sample, declared, costSensitive, costApproved }) {
  if (!deep) return null;
  if (declared === 'STUB' || declared === 'NOT_IMPLEMENTED') return 'DECLARED_NON_EXECUTABLE';
  if (record?.enabled === false) return 'DISABLED';
  const health = String(record?.health || '').toUpperCase();
  if (['UNAVAILABLE','OFFLINE','DISABLED','BLOCKED','DOWN','BROKEN'].includes(health)) return 'HEALTH_UNAVAILABLE';
  if (record?.risk !== 'LOW') return 'RISK_NOT_LOW';
  if (sample === undefined) return 'NO_BOUNDED_SAMPLE';
  if (costSensitive && !costApproved) return 'UNKNOWN_OR_EXTERNAL_COST';
  return null;
}

/**
 * Truthful audit of every registered MEL capability.
 * LOW-risk capabilities with a bounded sample are executed when deep=true,
 * except capabilities that may cross an external/provider or metered-runtime
 * cost boundary. Those remain fail-closed unless the caller explicitly proves
 * that exact capability is zero-added-cost for the current run through
 * zeroCostCapabilityIds.
 * The same gate applies to dynamic health probes: an unapproved provider or
 * metered-runtime path is inventoried from its registered state without
 * contacting that resource.
 * Explicit STUB / NOT_IMPLEMENTED records are never executed by the audit and
 * cannot masquerade as healthy-but-untested merely because a handler exists.
 * MEDIUM/HIGH or mutating capabilities are never auto-executed here; they are
 * still inventoried and reported with their real health/status and an explicit
 * auto_execution_blocked reason whenever deep execution was requested.
 */
export async function auditRuntimeCapabilities(runtime, {
  deep = false,
  context = {},
  samples = SAFE_SAMPLES,
  zeroCostCapabilityIds = [],
  onProgress = null,
  executionTimeoutMs = 15_000,
} = {}) {
  if (!runtime?.bus) throw new TypeError('CAPABILITY_BUS_REQUIRED');

  const provenZeroCost = new Set(
    Array.isArray(zeroCostCapabilityIds)
      ? zeroCostCapabilityIds.map(value => String(value))
      : []
  );

  let records = runtime.bus.list();
  if (typeof runtime.bus.refreshHealth === 'function') {
    const healthTimeoutMs = 4_000;
    const healthConcurrency = 8;
    const refreshed = new Array(records.length);
    for (let offset = 0; offset < records.length; offset += healthConcurrency) {
      await Promise.all(records.slice(offset, offset + healthConcurrency).map(async (record, localIndex) => {
        const index = offset + localIndex;
        const costSensitive = COST_SENSITIVE_CAPABILITIES.has(record.id);
        if (costSensitive && !provenZeroCost.has(record.id)) {
          refreshed[index] = record;
          return;
        }
        let timer;
        try {
          refreshed[index] = await Promise.race([
            runtime.bus.refreshHealth(record.id),
            new Promise((_, reject) => {
              timer = setTimeout(() => reject(Object.assign(
                new Error('CAPABILITY_AUDIT_HEALTH_TIMEOUT'),
                { code: 'CAPABILITY_AUDIT_HEALTH_TIMEOUT' },
              )), healthTimeoutMs);
            }),
          ]).finally(() => clearTimeout(timer));
        } catch {
          refreshed[index] = record;
        }
      }));
    }
    records = refreshed;
  }

  const rows = [];
  const progress = typeof onProgress === 'function' ? onProgress : null;
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    let execution = null;
    let contract = null;
    if (typeof runtime.bus.contract === 'function') {
      try { contract = runtime.bus.contract(record.id); }
      catch { contract = { valid:false, inspection_error:true }; }
    }
    let sample = samples?.[record.id];
    const declared = declaredImplementationStatus(record);
    const declaredNonExecutable = declared === 'STUB' || declared === 'NOT_IMPLEMENTED';
    const costSensitive = COST_SENSITIVE_CAPABILITIES.has(record.id);
    const costApproved = !costSensitive || provenZeroCost.has(record.id);
    let blockedReason = autoExecutionBlockReason({
      deep,
      record,
      sample,
      declared,
      costSensitive,
      costApproved,
    });
    if (blockedReason == null && typeof sample === 'function') {
      try {
        sample = await sample({ runtime, context, record });
        if (sample === undefined) blockedReason = 'NO_RUNTIME_FIXTURE';
      } catch (error) {
        blockedReason = 'SAMPLE_PREPARATION_FAILED:' + String(error?.code || error?.message || 'UNKNOWN').slice(0, 120);
        sample = undefined;
      }
    }
    const executable = deep
      && !declaredNonExecutable
      && record.enabled !== false
      && blockedReason == null
      && record.risk === 'LOW'
      && sample !== undefined
      && costApproved;
    if (executable) {
      const executionStartedAt = Date.now();
      try {
        const timeoutMs = Math.max(50, Math.min(60_000, Number(executionTimeoutMs) || 15_000));
        let timer;
        const result = await Promise.race([
          runtime.bus.execute(record.id, sample, {
            owner: context.owner || 'capability-audit',
            permissions: context.permissions || [],
            requestId: context.requestId || crypto.randomUUID(),
          }),
          new Promise((_, reject) => {
            timer = setTimeout(() => reject(Object.assign(
              new Error('CAPABILITY_AUDIT_EXECUTION_TIMEOUT'),
              { code: 'CAPABILITY_AUDIT_EXECUTION_TIMEOUT' },
            )), timeoutMs);
          }),
        ]).finally(() => clearTimeout(timer));
        execution = {
          ok: true,
          result_type: Array.isArray(result) ? 'array' : typeof result,
          duration_ms: Math.max(0, Date.now() - executionStartedAt),
        };
      } catch (error) {
        execution = {
          ok: false,
          code: String(error?.code || error?.message || 'CAPABILITY_FAILED'),
          duration_ms: Math.max(0, Date.now() - executionStartedAt),
        };
      }
    }
    const row = {
      id: record.id,
      name: record.name,
      category: record.category,
      provider: record.provider,
      risk: record.risk,
      enabled: record.enabled,
      health: record.health,
      implementation_status: declared,
      contract_valid: contract?.valid ?? null,
      contract,
      tested_now: Boolean(execution),
      auto_execution_blocked: blockedReason,
      execution,
      truth_status: classifyCapabilityTruth(record, execution),
    };
    rows.push(row);
    if (progress) await progress({ index: index + 1, total: records.length, row });
  }

  const counts = rows.reduce((acc, row) => {
    acc[row.truth_status] = (acc[row.truth_status] || 0) + 1;
    return acc;
  }, {});
  const contracts = {
    inspected: rows.filter(row => row.contract_valid !== null).length,
    valid: rows.filter(row => row.contract_valid === true).length,
    invalid: rows.filter(row => row.contract_valid === false).length,
  };
  return { ok: true, total: rows.length, deep: Boolean(deep), counts, contracts, capabilities: rows };
}

export { SAFE_SAMPLES, COST_SENSITIVE_CAPABILITIES, DECLARED_IMPLEMENTATION_STATUSES };
