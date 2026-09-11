const SAFE_SAMPLES = Object.freeze({
  echo: { value: 'capability-audit' },
  'roadmap.read': {},
  'system.bindings': {},
  'chatgpt.archive.preview': { archive: { conversations: [] } },
  'code.read': { path: 'package.json' },
  'code.search': { query: 'MELITURGOS' },
  'conversation.list': {},
  'rag.search': { query: 'MELITURGOS', limit: 1 },
  'autonomy.status': {},
});

function statusFrom(record, execution) {
  if (record.enabled === false) return 'BLOCKED';
  if (record.health === 'UNAVAILABLE') return 'BLOCKED_EXTERNAL';
  if (execution?.ok) return 'EXISTANT_ET_TESTE';
  if (execution && !execution.ok) return 'EXISTANT_MAIS_ECHEC_RUNTIME';
  if (record.health === 'HEALTHY') return 'EXISTANT_NON_TESTE';
  if (record.health === 'DEGRADED') return 'PARTIEL';
  return 'EXISTANT_NON_TESTE';
}

/**
 * Truthful audit of every registered MEL capability.
 * LOW-risk capabilities with a bounded sample are executed when deep=true.
 * MEDIUM/HIGH or mutating capabilities are never auto-executed here; they are
 * still inventoried and reported with their real health/status.
 */
export async function auditRuntimeCapabilities(runtime, { deep = false, context = {}, samples = SAFE_SAMPLES } = {}) {
  if (!runtime?.bus) throw new TypeError('CAPABILITY_BUS_REQUIRED');
  let records = [];
  try { records = await runtime.bus.refreshHealthAll(); }
  catch { records = runtime.bus.list(); }

  const rows = [];
  for (const record of records) {
    let execution = null;
    const sample = samples?.[record.id];
    const executable = deep && record.enabled !== false && record.risk === 'LOW' && sample !== undefined;
    if (executable) {
      try {
        const result = await runtime.bus.execute(record.id, sample, {
          owner: context.owner || 'capability-audit',
          permissions: context.permissions || [],
          requestId: context.requestId || crypto.randomUUID(),
        });
        execution = { ok: true, result_type: Array.isArray(result) ? 'array' : typeof result };
      } catch (error) {
        execution = { ok: false, code: String(error?.code || error?.message || 'CAPABILITY_FAILED') };
      }
    }
    rows.push({
      id: record.id,
      name: record.name,
      category: record.category,
      provider: record.provider,
      risk: record.risk,
      enabled: record.enabled,
      health: record.health,
      tested_now: Boolean(execution),
      execution,
      truth_status: statusFrom(record, execution),
    });
  }

  const counts = rows.reduce((acc, row) => {
    acc[row.truth_status] = (acc[row.truth_status] || 0) + 1;
    return acc;
  }, {});
  return { ok: true, total: rows.length, deep: Boolean(deep), counts, capabilities: rows };
}

export { SAFE_SAMPLES };
