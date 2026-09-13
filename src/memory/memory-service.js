import { port, requireValue } from '../core/contracts.js';
import { compileMemoryCandidates } from './compiler.js';

export const methods = ['create','confirm','search','update','supersede','findConflicts','consolidate','getProvenance'];

/** Existing memories table. New inferred facts enter memory_candidates, never confirmed directly. */
export function createMemoryService(db) {
  return port('memory',methods,{
    async search({query,limit=12}) {
      requireValue(typeof query === 'string' && Number.isInteger(limit) && limit>0 && limit<=100);
      return (await db.prepare("SELECT * FROM memories WHERE content LIKE ? AND (valid_until IS NULL OR valid_until>?) ORDER BY importance DESC LIMIT ?").bind('%'+query+'%',Date.now(),limit).all()).results;
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
