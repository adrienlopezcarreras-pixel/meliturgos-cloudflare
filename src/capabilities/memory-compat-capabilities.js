import { createMemoryService } from '../memory/memory-service.js';

async function safeCount(db, table) {
  if (!db) return 0;
  try {
    const row = await db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).first();
    return Number(row?.count || 0);
  } catch { return 0; }
}

async function safeRows(db, table, limit = 10000) {
  if (!db) return [];
  try {
    const rows = await db.prepare(`SELECT * FROM ${table} LIMIT ?`).bind(Math.max(1, Math.min(25000, Number(limit) || 10000))).all();
    return rows?.results || [];
  } catch { return []; }
}

export function registerMemoryCompatibilityCapabilities(bus, env = {}) {
  bus.discover({
    id: 'memory.status', name: 'État mémoire', category: 'memory', version: '1.0.0', provider: 'core',
    description: 'Reports bounded persistent memory, archive and conversation counts.',
    input_schema: { type: 'object', additionalProperties: false },
    output_schema: { type: 'object', additionalProperties: true },
    risk: 'LOW', permissions: [], health: 'HEALTHY', enabled: true,
  }, async () => {
    const [memoryCount, archiveCount, conversationCount] = await Promise.all([
      safeCount(env.DB, 'memories'),
      safeCount(env.DB, 'archive_messages'),
      safeCount(env.DB, 'conversations'),
    ]);
    return {
      ok: true,
      status: env.DB ? 'ONLINE' : 'UNAVAILABLE',
      db_bound: Boolean(env.DB),
      memory_count: memoryCount,
      archive_count: archiveCount,
      conversation_count: conversationCount,
      portable: true,
      provenance: true,
    };
  });

  bus.discover({
    id: 'memory.export', name: 'Exporter la mémoire', category: 'memory', version: '1.0.0', provider: 'core',
    description: 'Returns a portable bounded JSON snapshot of persistent MEL memory and conversations.',
    input_schema: { type: 'object', additionalProperties: false },
    output_schema: { type: 'object', additionalProperties: true },
    risk: 'LOW', permissions: [], health: 'HEALTHY', enabled: true,
  }, async () => {
    const [memories, archiveMessages, conversations] = await Promise.all([
      safeRows(env.DB, 'memories'),
      safeRows(env.DB, 'archive_messages'),
      safeRows(env.DB, 'conversations'),
    ]);
    return {
      format: 'meliturgos-memory-export',
      version: 1,
      exported_at: new Date().toISOString(),
      owner: env.MELITURGOS_USER || '',
      memories,
      conversations,
      archive_messages: archiveMessages,
    };
  });
  bus.discover({
    id: 'memory.consolidate', name: 'Compiler les candidats mémoire', category: 'memory', version: '1.0.0', provider: 'core',
    description: 'Compiles pending memory observations into deterministic deduplicated proposals with confidence, recency, topics and provenance. Read/proposal only: it never confirms or writes memories.',
    input_schema: {
      type: 'object',
      properties: { limit: { type: 'integer', minimum: 1, maximum: 500 } },
      additionalProperties: false,
    },
    output_schema: { type: 'object', additionalProperties: true },
    risk: 'LOW', permissions: [], health: env.DB ? 'HEALTHY' : 'UNAVAILABLE', enabled: true,
  }, async (input = {}) => {
    if (!env.DB) throw Object.assign(new Error('DB_BINDING_MISSING'), { code: 'DB_BINDING_MISSING', status: 503 });
    const limit = Number.isInteger(input.limit) ? input.limit : 100;
    return createMemoryService(env.DB).consolidate({ limit });
  });

}
