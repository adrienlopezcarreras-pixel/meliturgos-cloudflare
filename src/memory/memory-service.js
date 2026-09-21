import { port, requireValue } from '../core/contracts.js';
import { compileMemoryCandidates } from './compiler.js';
import { RAGService } from '../search/rag-service.js';

export const methods = ['create','confirm','search','retrieve','update','supersede','findConflicts','consolidate','getProvenance'];

/** Existing memories table. New inferred facts enter memory_candidates, never confirmed directly. */
export function createMemoryService(db, { semanticProvider = null } = {}) {
  return port('memory',methods,{
    async search({query,limit=12}) {
      requireValue(typeof query === 'string' && Number.isInteger(limit) && limit>0 && limit<=100);
      return (await db.prepare("SELECT * FROM memories WHERE content LIKE ? AND (valid_until IS NULL OR valid_until>?) ORDER BY importance DESC LIMIT ?").bind('%'+query+'%',Date.now(),limit).all()).results;
    },

    async retrieve({
      owner,
      query,
      limit = 12,
      sources = ['archive_messages','conversations','memories','knowledge_artifacts'],
      filters = {},
      semantic = true,
    }) {
      requireValue(typeof owner === 'string' && owner.trim().length > 0, 'AUTH_REQUIRED', 401);
      requireValue(typeof query === 'string' && query.trim().length > 0 && query.length <= 12000, 'INVALID_QUERY', 400);
      requireValue(Number.isInteger(limit) && limit > 0 && limit <= 100, 'INVALID_LIMIT', 400);
      requireValue(Array.isArray(sources) && sources.length > 0, 'INVALID_SOURCES', 400);
      requireValue(filters && typeof filters === 'object' && !Array.isArray(filters), 'INVALID_FILTERS', 400);

      const ragPromise = RAGService.searchHybrid(db, owner, query, {
        sources,
        limit: Math.min(100, Math.max(limit * 2, limit)),
        filters,
        semanticProvider: semantic ? semanticProvider : null,
      });
      const collectorPromise = sources.includes('archive_messages') && !Object.keys(filters).length
        ? RAGService.searchCollector(db, owner, query, { limit: Math.min(100, Math.max(limit * 2, limit)) })
            .catch(() => ({ results: [], total: 0, retrieval: 'collector-lexical' }))
        : Promise.resolve({ results: [], total: 0, retrieval: 'collector-filtered-through-hybrid' });
      const [rag, collector] = await Promise.all([ragPromise, collectorPromise]);

      const rows = [];
      const seen = new Set();
      for (const row of [...(rag.results || []), ...(collector.results || [])]) {
        const table = String(row?.source || row?.provenance?.table || 'unknown');
        const id = String(row?.id || row?.provenance?.id || '');
        const key = table + ':' + id;
        if (!id || seen.has(key)) continue;
        seen.add(key);
        rows.push(row);
      }
      rows.sort((a, b) => Number(b?.rank_score || b?.similarity || 0) - Number(a?.rank_score || a?.similarity || 0)
        || Number(b?.timestamp || 0) - Number(a?.timestamp || 0));
      const results = rows.slice(0, limit);

      return {
        results,
        total: results.length,
        retrieval: rag.retrieval === 'hybrid-exact-lexical-semantic'
          ? 'unified-operational-memory-hybrid'
          : 'unified-operational-memory',
        semantic_status: rag.semantic_status || 'DISABLED',
        filters_applied: rag.filters || filters,
        sources_consulted: [...sources],
        evidence_counts: {
          archive: results.filter(row => (row?.source || row?.provenance?.table) === 'archive_messages').length,
          memories: results.filter(row => (row?.source || row?.provenance?.table) === 'memories').length,
          knowledge: results.filter(row => (row?.source || row?.provenance?.table) === 'knowledge_artifacts').length,
          conversations: results.filter(row => (row?.source || row?.provenance?.table) === 'conversations').length,
        },
        rag,
        collector,
      };
    },

    async consolidate({limit=100} = {}) {
      requireValue(Number.isInteger(limit) && limit > 0 && limit <= 500, 'MEMORY_CONSOLIDATE_LIMIT_INVALID', 400);
      const now = Date.now();
      let pendingPromise;
      try {
        pendingPromise = db.prepare("SELECT id,conversation_id,message_id,content,confidence,source,status,created_at,provenance_json,metadata_json,observed_at,fragment,contradictions_json FROM memory_candidates WHERE status='PENDING' ORDER BY created_at ASC LIMIT ?").bind(limit).all();
      } catch {
        pendingPromise = db.prepare("SELECT id,conversation_id,message_id,content,confidence,source,status,created_at FROM memory_candidates WHERE status='PENDING' ORDER BY created_at ASC LIMIT ?").bind(limit).all();
      }
      let pendingResult;
      try {
        pendingResult = await pendingPromise;
      } catch {
        pendingResult = await db.prepare("SELECT id,conversation_id,message_id,content,confidence,source,status,created_at FROM memory_candidates WHERE status='PENDING' ORDER BY created_at ASC LIMIT ?").bind(limit).all();
      }
      const existingResult = await db.prepare("SELECT id,kind,content,confidence,source,provenance,metadata,created_at FROM memories WHERE valid_until IS NULL OR valid_until>? ORDER BY created_at ASC LIMIT ?").bind(now, Math.max(limit * 4, 100)).all();
      return compileMemoryCandidates({
        candidates: pendingResult?.results || [],
        existingMemories: existingResult?.results || [],
      });
    },

    async getProvenance({id}) {
      const row=await db.prepare('SELECT id,source,provenance,metadata,confidence FROM memories WHERE id=?').bind(id).first();
      requireValue(row,'MEMORY_NOT_FOUND',404);
      return row;
    }
  });
}
