import { proposeEvolution, transitionEvolution, evolutionSnapshot } from './evolution-inbox.js';
const CREATE = `CREATE TABLE IF NOT EXISTS mel_evolution_items (
 id TEXT PRIMARY KEY, canonical_title TEXT NOT NULL UNIQUE,
 payload TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 1,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
)`;
function database(db) { if (!db || typeof db.prepare !== 'function' || typeof db.exec !== 'function') throw new Error('EVOLUTION_D1_REQUIRED'); return db; }
export async function initializeEvolutionStorage(db) {
 await database(db).exec(CREATE);
}
export async function listEvolutionItems(db) {
 const result = await database(db).prepare('SELECT payload FROM mel_evolution_items ORDER BY id').all();
 if (!result || !Array.isArray(result.results)) throw new Error('EVOLUTION_STORAGE_READ_FAILED');
 return result.results.map(row => JSON.parse(row.payload));
}
// Storage is intentionally explicit: no silent automatic D1 schema creation at request time.
export async function saveEvolutionProposal(db, proposal) {
 const { evolutionKey } = await import('./evolution-inbox.js');
 database(db);
 if (!proposal || !String(proposal.id||'').trim() || !evolutionKey(proposal.title)) throw new Error('EVOLUTION_INVALID_PROPOSAL');
 const key = evolutionKey(proposal.title);
 const existing = await db.prepare('SELECT id FROM mel_evolution_items WHERE canonical_title = ?').bind(key).first();
 if (existing) return { created:false, duplicate_of:existing.id };
 const candidate = proposeEvolution([], proposal).item;
 try {
  const result=await db.prepare('INSERT INTO mel_evolution_items (id, canonical_title, payload) VALUES (?, ?, ?)').bind(candidate.id,key,JSON.stringify(candidate)).run();
  if (!result?.success) throw new Error('EVOLUTION_STORAGE_WRITE_FAILED');
  return { created:true,item:candidate };
 } catch(error) {
  // A racing writer may have inserted the same title; avoid masking unrelated SQL failures.
  const collision=await db.prepare('SELECT id FROM mel_evolution_items WHERE canonical_title = ?').bind(key).first();
  if (collision) return {created:false,duplicate_of:collision.id};
  throw error;
 }
}
export async function changeEvolutionStatus(db,id,expectedRevision,next,proof=null) {
 database(db);
 if (!Number.isInteger(expectedRevision) || expectedRevision<1) throw new Error('EVOLUTION_INVALID_REVISION');
 const row=await db.prepare('SELECT payload, revision FROM mel_evolution_items WHERE id = ?').bind(id).first();
 if (!row) throw new Error('EVOLUTION_ITEM_NOT_FOUND');
 if (row.revision!==expectedRevision) throw new Error('EVOLUTION_CONFLICT');
 const updated=transitionEvolution(JSON.parse(row.payload),next,{proof});
 const write=await db.prepare('UPDATE mel_evolution_items SET payload = ?, revision = revision + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND revision = ?')
 .bind(JSON.stringify(updated),id,expectedRevision).run();
 if (!write?.success || write.meta?.changes!==1) throw new Error('EVOLUTION_CONFLICT');
 return {item:updated,revision:expectedRevision+1};
}
export async function getEvolutionDashboard(db,initial,incidents=[]) {
 const items=await listEvolutionItems(db);
 return evolutionSnapshot({initial,items,incidents});
}
