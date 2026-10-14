import { createMemoryService } from '../memory/memory-service.js';
import { createWorkersAiSemanticProvider } from '../search/rag-service.js';
import { DB_SCHEMA_VERSION } from '../core/config.js';
import { createPortableMemorySnapshot, verifyPortableMemorySnapshot } from '../memory/portable-export.js';

async function safeCount(db, table) {
  if (!db) return 0;
  try {
    const row = await db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).first();
    const count = Number(row?.count);
    return row?.count != null && Number.isSafeInteger(count) && count >= 0 ? count : null;
  } catch {
    // A failed D1 count must never be represented as a genuine zero.
    return null;
  }
}

async function safeRows(db, table, limit = 10000) {
  if (!db) return [];
  try {
    const rows = await db.prepare(`SELECT * FROM ${table} LIMIT ?`).bind(Math.max(1, Math.min(25000, Number(limit) || 10000))).all();
    return rows?.results || [];
  } catch { return []; }
}

function exportReadFailure() {
  // Never present an unreadable/missing D1 source as an empty, complete
  // memory archive. Preserve the precise upstream exception in server logs,
  // not in an owner-facing export containing sensitive memory metadata.
  return Object.assign(new Error('MEMORY_EXPORT_SOURCE_READ_FAILED'), {
    code: 'MEMORY_EXPORT_SOURCE_READ_FAILED', status: 503,
  });
}

async function exportRows(db, table) {
  try {
    const result = await db.prepare(`SELECT * FROM ${table} LIMIT ?`).bind(10000).all();
    if (!Array.isArray(result?.results)) throw exportReadFailure();
    return result.results;
  } catch {
    throw exportReadFailure();
  }
}

async function exportCount(db, table) {
  try {
    const result = await db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).first();
    const count = Number(result?.count);
    if (!Number.isSafeInteger(count) || count < 0) throw exportReadFailure();
    return count;
  } catch {
    throw exportReadFailure();
  }
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
    const countsVerified = Boolean(env.DB)
      && [memoryCount, archiveCount, conversationCount].every(count => Number.isSafeInteger(count) && count >= 0);
    return {
      ok: true,
      status: !env.DB ? 'UNAVAILABLE' : countsVerified ? 'ONLINE' : 'DEGRADED',
      db_bound: Boolean(env.DB),
      counts_verified: countsVerified,
      memory_count: memoryCount,
      archive_count: archiveCount,
      conversation_count: conversationCount,
      portable: true,
      provenance: true,
    };
  });

  bus.discover({
    id: 'memory.export', name: 'Exporter la mémoire', category: 'memory', version: '1.1.0', provider: 'core',
    description: 'Returns a readable bounded JSON snapshot with schema version, per-collection SHA-256 checksums, completeness metadata and a global manifest checksum.',
    input_schema: { type: 'object', additionalProperties: false },
    output_schema: { type: 'object', additionalProperties: true },
    risk: 'LOW', permissions: [], health: env.DB ? 'HEALTHY' : 'UNAVAILABLE', enabled: true,
  }, async () => {
    if (!env.DB) throw Object.assign(new Error('DB_BINDING_MISSING'), { code: 'DB_BINDING_MISSING', status: 503 });
    const [memories, archiveMessages, conversations, memoryCount, archiveCount, conversationCount] = await Promise.all([
      exportRows(env.DB, 'memories'),
      exportRows(env.DB, 'archive_messages'),
      exportRows(env.DB, 'conversations'),
      exportCount(env.DB, 'memories'),
      exportCount(env.DB, 'archive_messages'),
      exportCount(env.DB, 'conversations'),
    ]);
    return createPortableMemorySnapshot({
      owner: env.MELITURGOS_USER || '',
      memories,
      conversations,
      archive_messages: archiveMessages,
      source_counts: {
        memories: memoryCount,
        conversations: conversationCount,
        archive_messages: archiveCount,
      },
      db_schema_version: DB_SCHEMA_VERSION,
    });
  });

  bus.discover({
    id: 'memory.export.verify', name: 'Vérifier un export mémoire', category: 'memory', version: '1.0.0', provider: 'core',
    description: 'Verifies schema version, record counts, completeness declarations and SHA-256 checksums of a MEL portable memory snapshot without writing data.',
    input_schema: { type: 'object', additionalProperties: true },
    output_schema: { type: 'object', additionalProperties: true },
    risk: 'LOW', permissions: [], health: 'HEALTHY', enabled: true,
  }, async input => verifyPortableMemorySnapshot(input));
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
