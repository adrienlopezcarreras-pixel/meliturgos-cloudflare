import { requireValue } from '../core/contracts.js';

const ARCHIVE_SCAN_LIMIT = 4000;
const CONVERSATION_SCAN_LIMIT = 1000;
const MEMORY_SCAN_LIMIT = 4000;
const KNOWLEDGE_SCAN_LIMIT = 1500;

function lexicalSql(column, tokens) {
  if (!tokens.length) return null;
  return tokens.map(() => `${column} LIKE ? COLLATE NOCASE`).join(' OR ');
}

function lexicalBindings(tokens) {
  return tokens.map(token => `%${token}%`);
}

function parseJson(value, fallback = {}) {
  if (!value || typeof value !== 'string') return fallback;
  try { return JSON.parse(value); } catch { return fallback; }
}

function attachmentList(row) {
  const parsed = parseJson(row?.attachments_json, []);
  return Array.isArray(parsed) ? parsed : [];
}

function archiveSearchableText(row) {
  return `${String(row?.content || '')} ${JSON.stringify(attachmentList(row))}`.toLowerCase();
}

async function archiveSearchRows(db, owner, where, patterns, fallbackWhere = where) {
  try {
    return (await db.prepare(`
      SELECT a.id,a.content,a.attachments_json,a.timestamp,a.conversation_id,a.role,
             a.provenance archive_provenance,a.metadata message_metadata,
             c.title conversation_title,c.metadata conversation_metadata,
             'archive_messages' source
      FROM archive_messages a
      JOIN conversations c ON c.id=a.conversation_id
      WHERE (c.owner=? OR c.owner='') AND (${where})
      ORDER BY a.timestamp DESC
      LIMIT ?
    `).bind(owner, ...patterns, ARCHIVE_SCAN_LIMIT).all()).results || [];
  } catch {
    return (await db.prepare(`
      SELECT a.id,a.content,NULL attachments_json,a.timestamp,a.conversation_id,a.role,
             NULL archive_provenance,NULL message_metadata,
             c.title conversation_title,NULL conversation_metadata,
             'archive_messages' source
      FROM archive_messages a
      JOIN conversations c ON c.id=a.conversation_id
      WHERE (c.owner=? OR c.owner='') AND (${fallbackWhere})
      ORDER BY a.timestamp DESC
      LIMIT ?
    `).bind(owner, ...patterns, ARCHIVE_SCAN_LIMIT).all()).results || [];
  }
}

async function collectorSearchRows(db, owner, roles, where, patterns, fallbackWhere = where) {
  const rolePlaceholders = roles.map(() => '?').join(',');
  try {
    return (await db.prepare(`
      SELECT a.id,a.content,a.attachments_json,a.timestamp,a.conversation_id,a.role,
             a.provenance archive_provenance,a.metadata message_metadata,
             c.title conversation_title,c.metadata conversation_metadata
      FROM archive_messages a
      JOIN conversations c ON c.id=a.conversation_id
      WHERE (c.owner=? OR c.owner='')
        AND (a.provenance='chatgpt_export' OR a.conversation_id LIKE 'chatgpt:%')
        AND a.role IN (${rolePlaceholders})
        AND (${where})
      ORDER BY a.timestamp DESC
      LIMIT ?
    `).bind(owner, ...roles, ...patterns, ARCHIVE_SCAN_LIMIT).all()).results || [];
  } catch {
    return (await db.prepare(`
      SELECT a.id,a.content,NULL attachments_json,a.timestamp,a.conversation_id,a.role,
             NULL archive_provenance,NULL message_metadata,
             c.title conversation_title,NULL conversation_metadata
      FROM archive_messages a
      JOIN conversations c ON c.id=a.conversation_id
      WHERE (c.owner=? OR c.owner='')
        AND a.conversation_id LIKE 'chatgpt:%'
        AND a.role IN (${rolePlaceholders})
        AND (${fallbackWhere})
      ORDER BY a.timestamp DESC
      LIMIT ?
    `).bind(owner, ...roles, ...patterns, ARCHIVE_SCAN_LIMIT).all()).results || [];
  }
}

function archiveMetadata(row) {
  const messageMetadata = parseJson(row?.message_metadata, {});
  const conversationMetadata = parseJson(row?.conversation_metadata, {});
  const receipt = conversationMetadata?.chatgpt_import && typeof conversationMetadata.chatgpt_import === 'object'
    ? conversationMetadata.chatgpt_import
    : null;
  return {
    conversation_title: row?.conversation_title || null,
    conversation_id: row?.conversation_id || null,
    archive_provenance: row?.archive_provenance || null,
    collector_source: messageMetadata.collector_source || receipt?.source || null,
    collector_version: messageMetadata.collector_version || receipt?.collector_version || null,
    collector_partial: messageMetadata.collector_partial === true || receipt?.partial === true,
    collector_complete: receipt?.complete === true,
    chatgpt_conversation_id: messageMetadata.chatgpt_conversation_id || null,
    attachments: attachmentList(row),
    attachment_count: attachmentList(row).length,
    attachment_binary_content_indexed: messageMetadata.attachment_binary_content_indexed === true,
  };
}

/** Canonical retrieval: bounded lexical search on the REAL schema; no invented vectors.
 * Mono-owner DB. Caller must supply authenticated owner, never a client userId.
 * Candidate rows are filtered in SQL by query tokens before the safety LIMIT, so
 * an old imported ChatGPT message is still retrievable after large archive imports.
 * Semantic embedding provider is a separate, explicitly configured port.
 */

function normalizedSearchValue(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function rowSource(row) {
  return String(row?.source || row?.provenance?.table || 'unknown');
}

function rowSearchText(row) {
  const attachments = Array.isArray(row?.attachments)
    ? row.attachments
    : (rowSource(row) === 'archive_messages' ? attachmentList(row) : []);
  return normalizedSearchValue([
    row?.content,
    row?.conversation_title,
    row?.title,
    row?.filename,
    row?.metadata,
    row?.message_metadata,
    JSON.stringify(attachments),
  ].filter(Boolean).join(' '));
}

function attachmentFileTypes(row) {
  const values = [];
  const attachments = Array.isArray(row?.attachments)
    ? row.attachments
    : (rowSource(row) === 'archive_messages' ? attachmentList(row) : []);
  for (const item of attachments) {
    const mime = String(item?.mime_type || item?.type || '').toLowerCase();
    const name = String(item?.name || item?.filename || '').toLowerCase();
    if (mime) values.push(mime);
    const dot = name.lastIndexOf('.');
    if (dot >= 0 && dot < name.length - 1) values.push(name.slice(dot + 1));
  }
  const filename = String(row?.filename || '').toLowerCase();
  const dot = filename.lastIndexOf('.');
  if (dot >= 0 && dot < filename.length - 1) values.push(filename.slice(dot + 1));
  return [...new Set(values)];
}

function normalizeFilters(filters = {}) {
  const out = {};
  if (filters && typeof filters === 'object') {
    const from = Number(filters.from ?? filters.date_from ?? NaN);
    const to = Number(filters.to ?? filters.date_to ?? NaN);
    if (Number.isFinite(from)) out.from = from;
    if (Number.isFinite(to)) out.to = to;
    if (filters.conversation_id) out.conversation_id = String(filters.conversation_id);
    if (filters.project) out.project = normalizedSearchValue(filters.project);
    if (filters.file_type) out.file_type = normalizedSearchValue(filters.file_type).replace(/^\./, '');
    if (filters.role) out.role = String(filters.role).toLowerCase();
    if (filters.source) out.source = String(filters.source).toLowerCase();
  }
  return out;
}

function rowPassesFilters(row, filters = {}) {
  const f = normalizeFilters(filters);
  const timestamp = Number(row?.timestamp ?? row?.updated_at ?? row?.created_at ?? 0);
  if (f.from != null && timestamp < f.from) return false;
  if (f.to != null && timestamp > f.to) return false;
  if (f.conversation_id && String(row?.conversation_id || row?.provenance?.conversation_id || '') !== f.conversation_id) return false;
  if (f.role && String(row?.role || '').toLowerCase() !== f.role) return false;
  if (f.source && rowSource(row).toLowerCase() !== f.source) return false;
  if (f.project && !rowSearchText(row).includes(f.project)) return false;
  if (f.file_type) {
    const fileTypes = attachmentFileTypes(row);
    if (!fileTypes.some(value => value === f.file_type || value.includes(f.file_type))) return false;
  }
  return true;
}

function exactMatchScore(row, query) {
  const needle = normalizedSearchValue(query);
  if (!needle) return 0;
  const haystack = rowSearchText(row);
  if (!haystack) return 0;
  if (haystack === needle) return 1;
  if (haystack.includes(needle)) return 0.85;
  const words = needle.split(' ').filter(Boolean);
  if (words.length > 1 && words.every(word => haystack.includes(word))) return 0.45;
  return 0;
}

async function semanticCandidateRows(db, owner, sources, filters = {}, limit = 96) {
  const bounded = Math.max(8, Math.min(200, Number(limit) || 96));
  const rows = [];
  if (sources.includes('archive_messages')) {
    try {
      rows.push(...((await db.prepare(`
        SELECT a.id,a.content,a.attachments_json,a.timestamp,a.conversation_id,a.role,
               a.provenance archive_provenance,a.metadata message_metadata,
               c.title conversation_title,c.metadata conversation_metadata,
               'archive_messages' source
        FROM archive_messages a
        JOIN conversations c ON c.id=a.conversation_id
        WHERE (c.owner=? OR c.owner='')
        ORDER BY a.timestamp DESC
        LIMIT ?
      `).bind(owner,bounded).all()).results || []));
    } catch {}
  }
  if (sources.includes('memories')) {
    try {
      rows.push(...((await db.prepare(`
        SELECT id,content,created_at timestamp,provenance,metadata,'memories' source
        FROM memories
        WHERE valid_until IS NULL OR valid_until>?
        ORDER BY created_at DESC
        LIMIT ?
      `).bind(Date.now(),bounded).all()).results || []));
    } catch {}
  }
  if (sources.includes('conversations')) {
    try {
      rows.push(...((await db.prepare(`
        SELECT id,title content,updated_at timestamp,title conversation_title,'conversations' source
        FROM conversations
        WHERE owner=? OR owner=''
        ORDER BY updated_at DESC
        LIMIT ?
      `).bind(owner,bounded).all()).results || []));
    } catch {}
  }
  if (sources.includes('knowledge_artifacts')) {
    try {
      rows.push(...((await db.prepare(`
        SELECT id,content,updated_at timestamp,filename,title,verification_status,content_sha256,'knowledge_artifacts' source
        FROM knowledge_artifacts
        WHERE owner=?
        ORDER BY updated_at DESC
        LIMIT ?
      `).bind(owner,bounded).all()).results || []));
    } catch {}
  }
  return rows.filter(row => rowPassesFilters(row, filters)).slice(0, bounded);
}

function semanticVectorData(output) {
  if (Array.isArray(output?.data)) return output.data;
  if (Array.isArray(output?.result?.data)) return output.result.data;
  if (Array.isArray(output?.embeddings)) return output.embeddings;
  if (Array.isArray(output)) return output;
  return null;
}

export function createWorkersAiSemanticProvider(env, {
  model = '@cf/baai/bge-m3',
  maxDocuments = 24,
  enabled = String(env?.MEL_MEMORY_SEMANTIC_ENABLED || '').toLowerCase() === 'true',
} = {}) {
  if (!enabled || !env?.AI || typeof env.AI.run !== 'function') return null;
  return async ({ query, documents = [] } = {}) => {
    const docs = (Array.isArray(documents) ? documents : [])
      .map(value => String(value || '').slice(0, 2200))
      .filter(Boolean)
      .slice(0, Math.max(1, Math.min(32, Number(maxDocuments) || 24)));
    if (!docs.length) return [];
    const output = await env.AI.run(model, { text: [String(query || '').slice(0, 2200), ...docs] });
    const vectors = semanticVectorData(output);
    if (!Array.isArray(vectors) || vectors.length < docs.length + 1 || !Array.isArray(vectors[0])) {
      throw new Error('SEMANTIC_EMBEDDING_RESPONSE_INVALID');
    }
    const queryVector = vectors[0];
    return docs.map((_, index) => RAGService.cosineSimilarity(queryVector, vectors[index + 1]));
  };
}


function decorateHybridRow(row) {
  const source = rowSource(row);
  if (source === 'archive_messages') {
    const archive = archiveMetadata(row);
    const role = String(row?.role || 'unknown');
    return {
      ...row,
      source,
      role,
      authority: row?.authority || (role.toLowerCase() === 'user' ? 'historical_user_message' : 'historical_assistant_output'),
      attachments: row?.attachments || archive.attachments || [],
      provenance: row?.provenance || { table:'archive_messages', id:row?.id, ...archive },
    };
  }
  if (source === 'memories') {
    return {
      ...row,
      source,
      authority: row?.authority || 'memory_record',
      provenance: row?.provenance && typeof row.provenance === 'object'
        ? row.provenance
        : { table:'memories', id:row?.id },
    };
  }
  if (source === 'knowledge_artifacts') {
    return {
      ...row,
      source,
      authority: row?.authority || (/^(?:VERIFIED_)/.test(String(row?.verification_status || '')) ? 'verified_knowledge_artifact' : 'knowledge_artifact'),
      provenance: row?.provenance || { table:'knowledge_artifacts', id:row?.id, filename:row?.filename||null, sha256:row?.content_sha256||null },
    };
  }
  if (source === 'conversations') {
    return {
      ...row,
      source,
      authority: row?.authority || 'conversation_title',
      provenance: row?.provenance || { table:'conversations', id:row?.id },
    };
  }
  return row;
}

export class RAGService {
  static async search(db, owner, query, {sources = ['archive_messages','conversations','memories','knowledge_artifacts'], limit = 10, minSimilarity = 0} = {}) {
    requireValue(typeof owner === 'string' && owner.length > 0, 'AUTH_REQUIRED',401);
    requireValue(typeof query === 'string' && query.trim().length > 0 && query.length <= 12000, 'INVALID_QUERY');
    requireValue(Array.isArray(sources) && sources.every(s => ['archive_messages','conversations','memories','knowledge_artifacts'].includes(s)), 'INVALID_SOURCES');
    requireValue(Number.isInteger(limit) && limit > 0 && limit <= 100, 'INVALID_LIMIT');
    const tokens = [...new Set(query.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) || [])].slice(0,32);
    if (!tokens.length) return {results:[],total:0,retrieval:'lexical'};
    const patterns = lexicalBindings(tokens);
    const rows = [];

    if (sources.includes('archive_messages')) {
      const attachmentWhere = lexicalSql("(COALESCE(a.content,'') || ' ' || COALESCE(a.attachments_json,''))", tokens);
      const contentWhere = lexicalSql('a.content', tokens);
      rows.push(...await archiveSearchRows(db, owner, attachmentWhere, patterns, contentWhere));
    }

    if (sources.includes('conversations')) {
      const where = lexicalSql('title', tokens);
      rows.push(...(await db.prepare(`
        SELECT id,title content,updated_at timestamp,'conversations' source
        FROM conversations
        WHERE (owner=? OR owner='') AND (${where})
        ORDER BY updated_at DESC
        LIMIT ?
      `).bind(owner, ...patterns, CONVERSATION_SCAN_LIMIT).all()).results);
    }

    if (sources.includes('memories')) {
      const where = lexicalSql('content', tokens);
      rows.push(...(await db.prepare(`
        SELECT id,content,created_at timestamp,provenance,'memories' source
        FROM memories
        WHERE (valid_until IS NULL OR valid_until>?) AND (${where})
        ORDER BY created_at DESC
        LIMIT ?
      `).bind(Date.now(), ...patterns, MEMORY_SCAN_LIMIT).all()).results);
    }

    if (sources.includes('knowledge_artifacts')) {
      const where = lexicalSql('content', tokens);
      try {
        rows.push(...(await db.prepare(`
          SELECT id,content,updated_at timestamp,filename,title,verification_status,content_sha256,'knowledge_artifacts' source
          FROM knowledge_artifacts
          WHERE owner=? AND (${where})
          ORDER BY updated_at DESC
          LIMIT ?
        `).bind(owner, ...patterns, KNOWLEDGE_SCAN_LIMIT).all()).results);
      } catch {
        // Compatibility with databases that have not migrated this workspace yet.
      }
    }

    const results = rows
      .map(row => {
        const searchable = row.source === 'archive_messages' ? archiveSearchableText(row) : String(row.content || '').toLowerCase();
        const similarity = tokens.filter(t => searchable.includes(t)).length/tokens.length;
        const role = row.source === 'archive_messages' ? String(row.role || 'unknown') : null;
        const archive = row.source === 'archive_messages' ? archiveMetadata(row) : null;
        const authority = row.source === 'archive_messages'
          ? (role.toLowerCase() === 'user' ? 'historical_user_message' : 'historical_assistant_output')
          : row.source === 'memories'
          ? 'memory_record'
          : row.source === 'knowledge_artifacts'
            ? (/^(?:VERIFIED_)/.test(String(row.verification_status || '')) ? 'verified_knowledge_artifact' : 'knowledge_artifact')
            : 'conversation_title';
        const rankScore = similarity
          + (authority === 'historical_user_message' ? 0.12 : 0)
          + (archive?.collector_complete === true ? 0.03 : 0);
        return {
          ...row,
          similarity,
          rank_score: rankScore,
          provenance:row.source === 'knowledge_artifacts'
            ? {table:row.source,id:row.id,filename:row.filename||null,sha256:row.content_sha256||null}
            : row.source === 'archive_messages'
              ? {table:row.source,id:row.id,...archive}
              : {table:row.source,id:row.id},
          attachments: row.source === 'archive_messages' ? (archive?.attachments || []) : [],
          role,
          authority,
          retrieval:'lexical'
        };
      })
      .filter(r => r.similarity > 0 && r.similarity >= minSimilarity)
      .sort((a,b) => b.rank_score-a.rank_score || b.timestamp-a.timestamp)
      .slice(0,limit);
    return {results,total:results.length,retrieval:'lexical'};
  }

  static async searchCollector(db, owner, query, { limit = 12, roles = ['user','assistant'] } = {}) {
    requireValue(typeof owner === 'string' && owner.length > 0, 'AUTH_REQUIRED',401);
    requireValue(typeof query === 'string' && query.trim().length > 0 && query.length <= 12000, 'INVALID_QUERY');
    requireValue(Number.isInteger(limit) && limit > 0 && limit <= 100, 'INVALID_LIMIT');
    requireValue(Array.isArray(roles) && roles.length > 0 && roles.every(role => ['user','assistant','system','tool'].includes(String(role))), 'INVALID_ROLES');

    const tokens = [...new Set(query.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) || [])].slice(0,32);
    if (!tokens.length) return { results: [], total: 0, retrieval: 'collector-lexical' };
    const where = lexicalSql("(COALESCE(a.content,'') || ' ' || COALESCE(a.attachments_json,''))", tokens);
    const fallbackWhere = lexicalSql('a.content', tokens);
    const patterns = lexicalBindings(tokens);
    const rows = await collectorSearchRows(db, owner, roles, where, patterns, fallbackWhere);

    const results = rows.map(row => {
      const similarity = tokens.filter(t => archiveSearchableText(row).includes(t)).length / tokens.length;
      const archive = archiveMetadata(row);
      const role = String(row.role || 'unknown');
      const authority = role === 'user' ? 'historical_user_message' : 'historical_assistant_output';
      const rankScore = similarity
        + (role === 'user' ? 0.18 : 0)
        + (archive.collector_complete === true ? 0.04 : 0)
        - (archive.collector_partial === true ? 0.02 : 0);
      return {
        id: row.id,
        content: row.content,
        timestamp: Number(row.timestamp || 0),
        conversation_id: row.conversation_id,
        conversation_title: row.conversation_title || null,
        attachments: archive.attachments || [],
        role,
        authority,
        similarity,
        rank_score: rankScore,
        retrieval: 'collector-lexical',
        provenance: { table: 'archive_messages', id: row.id, ...archive },
      };
    })
      .filter(row => row.similarity > 0)
      .sort((a,b) => b.rank_score-a.rank_score || b.timestamp-a.timestamp)
      .slice(0, limit);

    return { results, total: results.length, retrieval: 'collector-lexical' };
  }


  static async searchHybrid(db, owner, query, {
    sources = ['archive_messages','conversations','memories','knowledge_artifacts'],
    limit = 10,
    minSimilarity = 0,
    filters = {},
    semanticProvider = null,
    semanticCandidateLimit = 96,
  } = {}) {
    requireValue(typeof owner === 'string' && owner.length > 0, 'AUTH_REQUIRED',401);
    requireValue(typeof query === 'string' && query.trim().length > 0 && query.length <= 12000, 'INVALID_QUERY');
    requireValue(Array.isArray(sources) && sources.length > 0, 'INVALID_SOURCES');
    requireValue(Number.isInteger(limit) && limit > 0 && limit <= 100, 'INVALID_LIMIT');

    const lexical = await this.search(db, owner, query, {
      sources,
      limit: Math.min(100, Math.max(limit * 5, 30)),
      minSimilarity: 0,
    });

    const broad = semanticProvider
      ? await semanticCandidateRows(db, owner, sources, filters, semanticCandidateLimit)
      : [];

    const merged = [];
    const seen = new Set();
    for (const rawRow of [...(lexical.results || []), ...broad]) {
      const row = decorateHybridRow(rawRow);
      if (!rowPassesFilters(row, filters)) continue;
      const source = rowSource(row);
      const id = String(row?.id || row?.provenance?.id || '');
      const key = source + ':' + id;
      if (!id || seen.has(key)) continue;
      seen.add(key);
      const exact = exactMatchScore(row, query);
      const lexicalScore = Number(row?.similarity || 0);
      merged.push({
        ...row,
        source: row?.source || source,
        exact_score: exact,
        lexical_score: lexicalScore,
        semantic_score: 0,
      });
    }

    let semanticStatus = semanticProvider ? 'AVAILABLE' : 'DISABLED';
    if (semanticProvider && merged.length) {
      try {
        const docs = merged.map(row => rowSearchText(row).slice(0, 8000));
        const scores = await semanticProvider({ query, documents: docs });
        for (let index = 0; index < merged.length; index += 1) {
          const score = Number(scores?.[index] ?? 0);
          merged[index].semantic_score = Number.isFinite(score) ? Math.max(-1, Math.min(1, score)) : 0;
        }
        semanticStatus = 'SUCCEEDED';
      } catch (error) {
        semanticStatus = 'FAILED_FALLBACK_LEXICAL';
      }
    }

    const reranked = merged
      .map(row => {
        const authorityBonus = row.authority === 'historical_user_message' ? 0.08
          : row.authority === 'memory_record' ? 0.05
          : row.authority === 'verified_knowledge_artifact' ? 0.06
          : 0;
        const exactBonus = Number(row.exact_score || 0) * 0.35;
        const lexicalPart = Number(row.lexical_score || 0) * 0.45;
        const semanticPart = semanticStatus === 'SUCCEEDED'
          ? Math.max(0, Number(row.semantic_score || 0)) * 0.35
          : 0;
        const rankScore = exactBonus + lexicalPart + semanticPart + authorityBonus;
        return {
          ...row,
          rank_score: rankScore,
          retrieval: semanticStatus === 'SUCCEEDED' ? 'hybrid-exact-lexical-semantic' : 'hybrid-exact-lexical',
        };
      })
      .filter(row => row.exact_score > 0 || row.lexical_score >= minSimilarity || row.semantic_score > 0.2)
      .sort((a,b) => b.rank_score-a.rank_score || Number(b.timestamp||0)-Number(a.timestamp||0))
      .slice(0, limit);

    return {
      results: reranked,
      total: reranked.length,
      retrieval: semanticStatus === 'SUCCEEDED' ? 'hybrid-exact-lexical-semantic' : 'hybrid-exact-lexical',
      semantic_status: semanticStatus,
      filters: normalizeFilters(filters),
      lexical_total: Number(lexical.total || 0),
      candidate_total: merged.length,
    };
  }

  static cosineSimilarity(a,b) {
    if (!a || !b || a.length !== b.length) return 0;
    const dot=a.reduce((s,v,i)=>s+v*b[i],0);
    const norm=Math.sqrt(a.reduce((s,v)=>s+v*v,0)*b.reduce((s,v)=>s+v*v,0));
    return norm ? dot/norm : 0;
  }
}
