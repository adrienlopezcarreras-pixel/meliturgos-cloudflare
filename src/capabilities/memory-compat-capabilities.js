import { createMemoryService } from '../memory/memory-service.js';
import { createWorkersAiSemanticProvider } from '../search/rag-service.js';

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
    id: 'memory.retrieve', name: 'Rechercher dans la mémoire unifiée', category: 'memory', version: '1.0.0', provider: 'core',
    description: 'Hybrid exact/lexical/semantic retrieval across archives, memories, conversation titles and knowledge artifacts with provenance and structured filters.',
    input_schema: {
      type: 'object',
      required: ['query'],
      properties: {
        query: { type: 'string', minLength: 1, maxLength: 12000 },
        limit: { type: 'integer', minimum: 1, maximum: 100 },
        sources: { type: 'array', items: { type: 'string', enum: ['archive_messages','conversations','memories','knowledge_artifacts'] } },
        semantic: { type: 'boolean' },
        filters: {
          type: 'object',
          properties: {
            from: { type: 'number' },
            to: { type: 'number' },
            conversation_id: { type: 'string' },
            project: { type: 'string' },
            file_type: { type: 'string' },
            role: { type: 'string' },
            source: { type: 'string' }
          },
          additionalProperties: false
        }
      },
      additionalProperties: false,
    },
    output_schema: { type: 'object', additionalProperties: true },
    risk: 'LOW', permissions: [], health: env.DB ? 'HEALTHY' : 'UNAVAILABLE', enabled: true,
  }, async (input = {}) => {
    if (!env.DB) throw Object.assign(new Error('DB_BINDING_MISSING'), { code: 'DB_BINDING_MISSING', status: 503 });
    const semanticEnabled = input.semantic !== false && String(env.MEL_MEMORY_SEMANTIC_ENABLED || '').toLowerCase() === 'true';
    const semanticProvider=createWorkersAiSemanticProvider(env,{
      model:String(env.MEL_MEMORY_EMBEDDING_MODEL||'@cf/baai/bge-m3').trim(),
      enabled:semanticEnabled,
    });
    return createMemoryService(env.DB,{semanticProvider}).retrieve({
      owner: env.MELITURGOS_USER || 'owner',
      query: String(input.query || ''),
      limit: Number.isInteger(input.limit) ? input.limit : 12,
      sources: Array.isArray(input.sources) && input.sources.length ? input.sources : ['archive_messages','conversations','memories','knowledge_artifacts'],
      filters: input.filters || {},
      semantic: input.semantic !== false,
    });
  });

  bus.discover({
    id: 'memory.learn', name: 'Confirmer un apprentissage mémoire', category: 'memory', version: '1.0.0', provider: 'core',
    description: 'Confirms one canonical fact from archive-derived memory candidates while preserving conversation/message/source/date fragments, confidence and explicit contradiction snapshots.',
    input_schema: {
      type: 'object',
      required: ['candidate_ids'],
      properties: {
        candidate_ids: { type: 'array', minItems: 1, maxItems: 32, items: { type: 'string', minLength: 1, maxLength: 240 } },
        kind: { type: 'string', minLength: 1, maxLength: 120 },
        contradiction_ids: { type: 'array', maxItems: 32, items: { type: 'string', minLength: 1, maxLength: 80 } }
      },
      additionalProperties: false,
    },
    output_schema: { type: 'object', additionalProperties: true },
    risk: 'MEDIUM', permissions: [], health: env.DB ? 'HEALTHY' : 'UNAVAILABLE', enabled: true,
  }, async (input = {}) => {
    if (!env.DB) throw Object.assign(new Error('DB_BINDING_MISSING'), { code: 'DB_BINDING_MISSING', status: 503 });
    return createMemoryService(env.DB).confirm({
      candidateIds: input.candidate_ids,
      kind: input.kind || 'fact',
      contradictionIds: input.contradiction_ids || [],
    });
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
