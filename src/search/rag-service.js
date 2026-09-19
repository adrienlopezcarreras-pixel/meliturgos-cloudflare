import { requireValue } from '../core/contracts.js';

const ARCHIVE_SCAN_LIMIT = 4000;
const CONVERSATION_SCAN_LIMIT = 1000;
const MEMORY_SCAN_LIMIT = 4000;

function lexicalSql(column, tokens) {
  if (!tokens.length) return null;
  return tokens.map(() => `${column} LIKE ? COLLATE NOCASE`).join(' OR ');
}

function lexicalBindings(tokens) {
  return tokens.map(token => `%${token}%`);
}

/** Canonical retrieval: bounded lexical search on the REAL schema; no invented vectors.
 * Mono-owner DB. Caller must supply authenticated owner, never a client userId.
 * Candidate rows are filtered in SQL by query tokens before the safety LIMIT, so
 * an old imported ChatGPT message is still retrievable after large archive imports.
 * Semantic embedding provider is a separate, explicitly configured port.
 */
export class RAGService {
  static async search(db, owner, query, {sources = ['archive_messages','conversations','memories'], limit = 10, minSimilarity = 0} = {}) {
    requireValue(typeof owner === 'string' && owner.length > 0, 'AUTH_REQUIRED',401);
    requireValue(typeof query === 'string' && query.trim().length > 0 && query.length <= 12000, 'INVALID_QUERY');
    requireValue(Array.isArray(sources) && sources.every(s => ['archive_messages','conversations','memories'].includes(s)), 'INVALID_SOURCES');
    requireValue(Number.isInteger(limit) && limit > 0 && limit <= 100, 'INVALID_LIMIT');
    const tokens = [...new Set(query.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) || [])].slice(0,32);
    if (!tokens.length) return {results:[],total:0,retrieval:'lexical'};
    const patterns = lexicalBindings(tokens);
    const rows = [];

    if (sources.includes('archive_messages')) {
      const where = lexicalSql('a.content', tokens);
      rows.push(...(await db.prepare(`
        SELECT a.id,a.content,a.timestamp,a.conversation_id,'archive_messages' source
        FROM archive_messages a
        JOIN conversations c ON c.id=a.conversation_id
        WHERE (c.owner=? OR c.owner='') AND (${where})
        ORDER BY a.timestamp DESC
        LIMIT ?
      `).bind(owner, ...patterns, ARCHIVE_SCAN_LIMIT).all()).results);
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

    const results = rows
      .map(row => ({
        ...row,
        similarity: tokens.filter(t => String(row.content).toLowerCase().includes(t)).length/tokens.length,
        provenance:{table:row.source,id:row.id},
        retrieval:'lexical'
      }))
      .filter(r => r.similarity > 0 && r.similarity >= minSimilarity)
      .sort((a,b) => b.similarity-a.similarity || b.timestamp-a.timestamp)
      .slice(0,limit);
    return {results,total:results.length,retrieval:'lexical'};
  }

  static cosineSimilarity(a,b) {
    if (!a || !b || a.length !== b.length) return 0;
    const dot=a.reduce((s,v,i)=>s+v*b[i],0);
    const norm=Math.sqrt(a.reduce((s,v)=>s+v*v,0)*b.reduce((s,v)=>s+v*v,0));
    return norm ? dot/norm : 0;
  }
}
