import { port, requireValue } from '../core/contracts.js';
export const methods = ['create','confirm','search','update','supersede','findConflicts','consolidate','getProvenance'];
/** Existing memories table. New inferred facts enter memory_candidates, never confirmed directly. */
export function createMemoryService(db) {
  return port('memory',methods,{
    async search({query,limit=12}) { requireValue(typeof query === 'string' && Number.isInteger(limit) && limit>0 && limit<=100); return (await db.prepare("SELECT * FROM memories WHERE content LIKE ? AND (valid_until IS NULL OR valid_until>?) ORDER BY importance DESC LIMIT ?").bind('%'+query+'%',Date.now(),limit).all()).results; },
    async getProvenance({id}) { const row=await db.prepare('SELECT id,source,provenance,metadata,confidence FROM memories WHERE id=?').bind(id).first(); requireValue(row,'MEMORY_NOT_FOUND',404); return row; }
  });
}
