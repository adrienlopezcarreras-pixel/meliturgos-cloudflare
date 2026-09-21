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

  static cosineSimilarity(a,b) {
    if (!a || !b || a.length !== b.length) return 0;
    const dot=a.reduce((s,v,i)=>s+v*b[i],0);
    const norm=Math.sqrt(a.reduce((s,v)=>s+v*v,0)*b.reduce((s,v)=>s+v*v,0));
    return norm ? dot/norm : 0;
  }
}
