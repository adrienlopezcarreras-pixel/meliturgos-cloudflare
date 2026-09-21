import { port, requireValue } from '../core/contracts.js';
import { canonicalMemoryKey, compileMemoryCandidates } from './compiler.js';
import { RAGService } from '../search/rag-service.js';

export const methods = ['create','confirm','search','retrieve','update','supersede','findConflicts','consolidate','getProvenance'];

async function sha256Hex(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(value)));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

function parseJsonObject(value) {
  if (!value || typeof value !== 'string') return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function boundedUniqueStrings(values, max = 32) {
  return [...new Set((Array.isArray(values) ? values : []).map(value => String(value || '').trim()).filter(Boolean))].slice(0, max);
}


/** Existing memories table. New inferred facts enter memory_candidates, never confirmed directly. */
export function createMemoryService(db, { semanticProvider = null } = {}) {
  return port('memory',methods,{

    async confirm({candidateIds = [], kind = 'fact', contradictionIds = []} = {}) {
      const ids = boundedUniqueStrings(candidateIds, 32);
      const conflictIds = boundedUniqueStrings(contradictionIds, 32);
      requireValue(ids.length > 0, 'MEMORY_CANDIDATE_IDS_REQUIRED', 400);
      requireValue(typeof kind === 'string' && kind.trim().length > 0 && kind.length <= 120, 'MEMORY_KIND_INVALID', 400);

      const placeholders = ids.map(() => '?').join(',');
      const candidateResult = await db.prepare(`SELECT id,conversation_id,message_id,content,confidence,source,status,created_at
        FROM memory_candidates WHERE id IN (${placeholders}) ORDER BY created_at ASC,id ASC`).bind(...ids).all();
      const candidates = candidateResult?.results || [];
      requireValue(candidates.length === ids.length, 'MEMORY_CANDIDATE_NOT_FOUND', 404);

      const existingResult = await db.prepare(`SELECT id,kind,content,confidence,source,provenance,metadata,created_at
        FROM memories WHERE valid_until IS NULL OR valid_until>? ORDER BY created_at ASC LIMIT 2000`).bind(Date.now()).all();
      const compiled = compileMemoryCandidates({
        candidates: candidates.map(row => ({ ...row, kind: kind.trim() })),
        existingMemories: existingResult?.results || [],
      });
      requireValue(compiled.rejected_count === 0 && compiled.proposal_count === 1, 'MEMORY_CONFIRM_REQUIRES_ONE_CANONICAL_FACT', 409);
      const proposal = compiled.proposals[0];

      let conflicts = [];
      if (conflictIds.length) {
        const conflictPlaceholders = conflictIds.map(() => '?').join(',');
        const result = await db.prepare(`SELECT id,kind,content,confidence,source,provenance,metadata,created_at
          FROM memories WHERE id IN (${conflictPlaceholders})`).bind(...conflictIds).all();
        conflicts = result?.results || [];
        requireValue(conflicts.length === conflictIds.length, 'MEMORY_CONTRADICTION_NOT_FOUND', 404);
      }

      const evidence = candidates.map(row => Object.freeze({
        candidate_id: row.id,
        conversation_id: row.conversation_id,
        message_id: row.message_id,
        source: row.source,
        observed_at: Number(row.created_at || 0),
        confidence: Number(row.confidence || 0),
        fragment: String(row.content || '').slice(0, 2000),
      }));
      const provenance = {
        version: 2,
        compiler: 'mel-memory-compiler',
        candidate_ids: proposal.provenance.candidate_ids,
        conversation_ids: proposal.provenance.conversation_ids,
        message_ids: proposal.provenance.message_ids,
        sources: proposal.provenance.sources,
        observations: proposal.provenance.observations,
        evidence,
      };
      const contradictionSnapshot = conflicts.map(row => ({
        id: row.id,
        kind: row.kind,
        content: String(row.content || '').slice(0, 2000),
        confidence: Number(row.confidence || 0),
        source: row.source || null,
        created_at: Number(row.created_at || 0),
      }));

      let memoryId = proposal.existing_memory_id ?? null;
      let created = false;
      if (!memoryId) {
        const fingerprint = await sha256Hex(canonicalMemoryKey(proposal.content, proposal.kind));
        const metadata = {
          learning_class: 'archive_confirmed',
          confidence_policy: proposal.confidence_policy,
          quality: proposal.quality,
          recency: proposal.recency,
          topics: proposal.topics,
          contradictions: contradictionSnapshot,
        };
        await db.prepare(`INSERT INTO memories(
          created_at,kind,content,importance,confidence,valid_from,valid_until,source,provenance,metadata,fingerprint
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?)`).bind(
          Date.now(), proposal.kind, proposal.content, 0.8, proposal.confidence,
          proposal.recency?.last_observed_at ?? null, null, 'archive_learning',
          JSON.stringify(provenance), JSON.stringify(metadata), fingerprint
        ).run();
        const row = await db.prepare('SELECT id FROM memories WHERE fingerprint=? ORDER BY id DESC LIMIT 1').bind(fingerprint).first();
        memoryId = row?.id ?? null;
        requireValue(memoryId != null, 'MEMORY_CONFIRM_WRITE_FAILED', 500);
        created = true;
      }

      for (const id of ids) {
        await db.prepare("UPDATE memory_candidates SET status='CONFIRMED' WHERE id=?").bind(id).run();
      }

      return Object.freeze({
        created,
        memory_id: memoryId,
        action: created ? 'CREATED' : 'REUSED_EXISTING',
        content: proposal.content,
        kind: proposal.kind,
        confidence: proposal.confidence,
        provenance,
        contradictions: contradictionSnapshot,
        candidate_ids: ids,
      });
    },

    async findConflicts({id}) {
      requireValue(id !== undefined && id !== null, 'MEMORY_ID_REQUIRED', 400);
      const row = await db.prepare('SELECT id,metadata FROM memories WHERE id=?').bind(id).first();
      requireValue(row, 'MEMORY_NOT_FOUND', 404);
      const metadata = parseJsonObject(row.metadata);
      const ids = boundedUniqueStrings((metadata.contradictions || []).map(item => typeof item === 'object' ? item?.id : item), 32);
      if (!ids.length) return { memory_id: row.id, conflict_ids: [], conflicts: [] };
      const placeholders = ids.map(() => '?').join(',');
      const result = await db.prepare(`SELECT id,kind,content,confidence,source,provenance,metadata,created_at
        FROM memories WHERE id IN (${placeholders})`).bind(...ids).all();
      return { memory_id: row.id, conflict_ids: ids, conflicts: result?.results || [] };
    },


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
      const [pendingResult, existingResult] = await Promise.all([
        db.prepare("SELECT id,conversation_id,message_id,content,confidence,source,status,created_at FROM memory_candidates WHERE status='PENDING' ORDER BY created_at ASC LIMIT ?").bind(limit).all(),
        db.prepare("SELECT id,kind,content,confidence,source,provenance,metadata,created_at FROM memories WHERE valid_until IS NULL OR valid_until>? ORDER BY created_at ASC LIMIT ?").bind(now, Math.max(limit * 4, 100)).all(),
      ]);
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
