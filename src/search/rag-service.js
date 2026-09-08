import { requireValue } from '../core/contracts.js';
/** Canonical retrieval: bounded lexical search on the REAL schema; no invented vectors.
 * Mono-owner DB. Caller must supply authenticated owner, never a client userId.
 * Semantic embedding provider is a separate, explicitly configured port.
 */
export class RAGService {
  static async search(db, owner, query, {sources = ['archive_messages','conversations','memories'], limit = 10, minSimilarity = 0} = {}) {
    requireValue(typeof owner === 'string' && owner.length > 0, 'AUTH_REQUIRED',401);
    requireValue(typeof query === 'string' && query.trim().length > 0 && query.length <= 12000, 'INVALID_QUERY');
    requireValue(Array.isArray(sources) && sources.every(s => ['archive_messages','conversations','memories'].includes(s)), 'INVALID_SOURCES');
    requireValue(Number.isInteger(limit) && limit > 0 && limit <= 100, 'INVALID_LIMIT');
    const tokens = [...new Set(query.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) || [])].slice(0,32);
    const rows = [];
    if (sources.includes('archive_messages')) rows.push(...(await db.prepare("SELECT a.id,a.content,a.timestamp,a.conversation_id,'archive_messages' source FROM archive_messages a JOIN conversations c ON c.id=a.conversation_id WHERE c.owner=? OR c.owner='' ORDER BY a.timestamp DESC LIMIT 1000").bind(owner).all()).results);
    if (sources.includes('conversations')) rows.push(...(await db.prepare("SELECT id,title content,updated_at timestamp,'conversations' source FROM conversations WHERE owner=? OR owner='' ORDER BY updated_at DESC LIMIT 100").bind(owner).all()).results);
    if (sources.includes('memories')) rows.push(...(await db.prepare("SELECT id,content,created_at timestamp,provenance,'memories' source FROM memories WHERE valid_until IS NULL OR valid_until>? ORDER BY created_at DESC LIMIT 1000").bind(Date.now()).all()).results);
    const results = rows.map(row => ({...row, similarity: tokens.length ? tokens.filter(t => String(row.content).toLowerCase().includes(t)).length/tokens.length : 0, provenance:{table:row.source,id:row.id}, retrieval:'lexical'})).filter(r => r.similarity > 0 && r.similarity >= minSimilarity).sort((a,b) => b.similarity-a.similarity || b.timestamp-a.timestamp).slice(0,limit);
    return {results,total:results.length,retrieval:'lexical'};
  }
  static cosineSimilarity(a,b) { if (!a || !b || a.length !== b.length) return 0; const dot=a.reduce((s,v,i)=>s+v*b[i],0), norm=Math.sqrt(a.reduce((s,v)=>s+v*v,0)*b.reduce((s,v)=>s+v*v,0)); return norm ? dot/norm : 0; }
}
