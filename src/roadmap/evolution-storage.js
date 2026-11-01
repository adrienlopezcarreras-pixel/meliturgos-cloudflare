import { evolutionKey, proposeEvolution, transitionEvolution, evolutionSnapshot } from './evolution-inbox.js';

// Schema is applied by the release migration; never created as a side effect of a read.
const CREATE = `CREATE TABLE IF NOT EXISTS mel_evolution_items (
 owner_scope TEXT NOT NULL,
 id TEXT NOT NULL,
 canonical_title TEXT NOT NULL,
 payload TEXT NOT NULL,
 revision INTEGER NOT NULL DEFAULT 1,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY (owner_scope, id),
 UNIQUE (owner_scope, canonical_title)
)`;
const ARCHIVE = `CREATE TABLE IF NOT EXISTS mel_evolution_initial_archive (
 archive_id TEXT PRIMARY KEY,
 source_sha TEXT NOT NULL CHECK (length(source_sha) = 40),
 verified_count INTEGER NOT NULL CHECK (verified_count >= 0),
 total_count INTEGER NOT NULL CHECK (total_count >= verified_count),
 proof_reference TEXT NOT NULL,
 closed_at TEXT NOT NULL
)`;
const ARCHIVE_IMMUTABLE_UPDATE = `CREATE TRIGGER IF NOT EXISTS mel_evolution_archive_no_update BEFORE UPDATE ON mel_evolution_initial_archive BEGIN SELECT RAISE(ABORT, 'ARCHIVE_IMMUTABLE'); END`;
const ARCHIVE_IMMUTABLE_DELETE = `CREATE TRIGGER IF NOT EXISTS mel_evolution_archive_no_delete BEFORE DELETE ON mel_evolution_initial_archive BEGIN SELECT RAISE(ABORT, 'ARCHIVE_IMMUTABLE'); END`;
function database(db) {
 if (!db || typeof db.prepare !== 'function') throw new Error('EVOLUTION_D1_REQUIRED');
 return db;
}
function ownerScope(owner) {
 if (typeof owner !== 'string' || !owner.trim() || owner.length > 200) throw new Error('EVOLUTION_OWNER_REQUIRED');
 return owner.trim();
}
// IDs become lowercase inside supervised job identifiers. Enforce owner-scoped
// case-insensitive uniqueness at the database level so concurrent writers cannot
// create ABC and abc and permanently block autonomy.
export async function enforceEvolutionIdCaseIndex(db) {
 const store=database(db);
 const duplicate=await store.prepare('SELECT a.id FROM mel_evolution_items a JOIN mel_evolution_items b ON a.owner_scope = b.owner_scope AND lower(a.id) = lower(b.id) AND a.id <> b.id LIMIT 1').first();
 if (duplicate) throw new Error('EVOLUTION_CASE_COLLISION_MIGRATION_REQUIRED');
 const result=await store.prepare('CREATE UNIQUE INDEX IF NOT EXISTS idx_mel_evolution_owner_id_nocase ON mel_evolution_items(owner_scope,lower(id))').run();
 if (result?.success === false) throw new Error('EVOLUTION_ID_CASE_INDEX_FAILED');
}
export async function initializeEvolutionStorage(db) {
 const store=database(db);
 for(const sql of [CREATE,
  'CREATE INDEX IF NOT EXISTS idx_mel_evolution_owner_updated ON mel_evolution_items(owner_scope,updated_at DESC)',
  ARCHIVE,ARCHIVE_IMMUTABLE_UPDATE,ARCHIVE_IMMUTABLE_DELETE]) {
  await store.prepare(sql).run();
 }
 await enforceEvolutionIdCaseIndex(store);
}
// Creating the loader never interprets a missing DB as an empty queue.
// The supervisor catches the actual read failure and reports UNAVAILABLE.
export function createRuntimeEvolutionLoader(env = {}) {
 return () => listEvolutionItems(env?.DB, String(env?.MELITURGOS_USER || 'owner'));
}

export async function listEvolutionItems(db, owner) {
 const scope=ownerScope(owner);
 const result=await database(db).prepare('SELECT payload,revision FROM mel_evolution_items WHERE owner_scope = ? ORDER BY id').bind(scope).all();
 if (!result || !Array.isArray(result.results)) throw new Error('EVOLUTION_STORAGE_READ_FAILED');
 return result.results.map(row => {
  const item=JSON.parse(row.payload);
  if (!Number.isSafeInteger(row.revision) || row.revision<1) throw new Error('EVOLUTION_STORAGE_REVISION_INVALID');
  return {...item,revision:row.revision};
 });
}
export async function saveEvolutionProposal(db, owner, proposal) {
 const scope=ownerScope(owner);
 database(db);
 if (!proposal || !String(proposal.id||'').trim() || !evolutionKey(proposal.title)) throw new Error('EVOLUTION_INVALID_PROPOSAL');
 const candidate=proposeEvolution([],proposal).item;
 const key=evolutionKey(candidate.title);
 const existing=await db.prepare('SELECT id FROM mel_evolution_items WHERE owner_scope = ? AND canonical_title = ?').bind(scope,key).first();
 if (existing) return {created:false,duplicate_of:existing.id};
 const idExisting=await db.prepare('SELECT id FROM mel_evolution_items WHERE owner_scope = ? AND lower(id) = lower(?)').bind(scope,candidate.id).first();
 if (idExisting) throw new Error('EVOLUTION_DUPLICATE_ID');
 try {
  const inserted=await db.prepare('INSERT INTO mel_evolution_items (owner_scope,id,canonical_title,payload) VALUES (?,?,?,?)').bind(scope,candidate.id,key,JSON.stringify(candidate)).run();
  if (!inserted?.success) throw new Error('EVOLUTION_STORAGE_WRITE_FAILED');
  return {created:true,item:candidate};
 } catch(error) {
  const collision=await db.prepare('SELECT id FROM mel_evolution_items WHERE owner_scope = ? AND canonical_title = ?').bind(scope,key).first();
  if (collision) return {created:false,duplicate_of:collision.id};
  const idCollision=await db.prepare('SELECT id FROM mel_evolution_items WHERE owner_scope = ? AND lower(id) = lower(?)').bind(scope,candidate.id).first();
  if (idCollision) throw new Error('EVOLUTION_DUPLICATE_ID');
  throw error;
 }
}
export async function changeEvolutionStatus(db, owner, id, expectedRevision, next, proof=null) {
 const scope=ownerScope(owner);
 database(db);
 if (!Number.isInteger(expectedRevision) || expectedRevision<1) throw new Error('EVOLUTION_INVALID_REVISION');
 const row=await db.prepare('SELECT payload,revision FROM mel_evolution_items WHERE owner_scope = ? AND id = ?').bind(scope,id).first();
 if (!row) throw new Error('EVOLUTION_ITEM_NOT_FOUND');
 if (row.revision!==expectedRevision) throw new Error('EVOLUTION_CONFLICT');
 const updated=transitionEvolution(JSON.parse(row.payload),next,{proof});
 const write=await db.prepare('UPDATE mel_evolution_items SET payload = ?, revision = revision + 1, updated_at = CURRENT_TIMESTAMP WHERE owner_scope = ? AND id = ? AND revision = ?')
  .bind(JSON.stringify(updated),scope,id,expectedRevision).run();
 if (!write?.success || write.meta?.changes!==1) throw new Error('EVOLUTION_CONFLICT');
 return {item:updated,revision:expectedRevision+1};
}
export async function readInitialArchive(db) {
 const row=await database(db).prepare('SELECT archive_id,source_sha,verified_count,total_count,proof_reference,closed_at FROM mel_evolution_initial_archive ORDER BY closed_at DESC,archive_id DESC LIMIT 1').first();
 if (!row) return null;
 const sha=String(row.source_sha||'');
 if (!/^[a-f0-9]{40}$/.test(sha) || !String(row.archive_id||'').trim() || !String(row.proof_reference||'').trim() || !String(row.closed_at||'').trim() ||
     !Number.isSafeInteger(row.total_count) || row.total_count<1 ||
     !Number.isSafeInteger(row.verified_count) || row.verified_count!==row.total_count) {
  throw new Error('EVOLUTION_ARCHIVE_INVALID');
 }
 return Object.freeze({archive_id:row.archive_id,source_sha:sha,proof_reference:row.proof_reference,closed_at:row.closed_at,total:row.total_count,verified:row.verified_count});
}
export async function getEvolutionDashboard(db, owner, initial, incidents=null) {
 const items=await listEvolutionItems(db,owner);
 const archive=await readInitialArchive(db);
 const verifiedInitial=archive?{total:archive.total,verified:archive.verified}:initial;
 const snapshot=evolutionSnapshot({initial:verifiedInitial,items,incidents});
 return Object.freeze({...snapshot,initial_scope:archive?'ARCHIVED_VERIFIED':'CURRENT_REGISTRY_NOT_ARCHIVED',archive:archive??null});
}

// MEL-FOUNDER-03: a missing capability becomes ONE resumable objective, never
// a new one at each attempt. The key is the capability itself, so a second
// detection of the same gap re-opens the same objective instead of piling up
// duplicates that MAX would then work on in parallel.
export function missingCapabilityObjectiveId(capabilityId) {
  const id = String(capabilityId || '').trim().toLowerCase();
  if (!/^[a-z][a-z0-9._-]{2,80}$/.test(id)) throw Object.assign(new Error('MISSING_CAPABILITY_ID_INVALID'), { code: 'MISSING_CAPABILITY_ID_INVALID' });
  return 'capability-gap:' + id;
}

export async function openMissingCapabilityObjective(db, { capability_id, authorized = false, owner = 'mel-autonomy', now = Date.now() } = {}) {
  // An unauthorized gap is reported, never turned into development work.
  if (authorized !== true) return { opened: false, code: 'MISSING_CAPABILITY_NOT_AUTHORIZED', objective_id: null };
  const objectiveId = missingCapabilityObjectiveId(capability_id);
  await db.prepare('CREATE TABLE IF NOT EXISTS mel_capability_gap_objectives (id TEXT PRIMARY KEY, capability_id TEXT NOT NULL, owner TEXT NOT NULL, status TEXT NOT NULL, opened_at INTEGER NOT NULL, attempts INTEGER NOT NULL DEFAULT 1)').run();
  const existing = await db.prepare('SELECT id, status, attempts FROM mel_capability_gap_objectives WHERE id=?').bind(objectiveId).first();
  if (existing) {
    await db.prepare('UPDATE mel_capability_gap_objectives SET attempts=attempts+1, status=CASE WHEN status=? THEN ? ELSE status END WHERE id=?')
      .bind('CLOSED', 'OPEN', objectiveId).run();
    return { opened: false, resumed: true, code: 'MISSING_CAPABILITY_OBJECTIVE_RESUMED', objective_id: objectiveId };
  }
  await db.prepare('INSERT INTO mel_capability_gap_objectives (id, capability_id, owner, status, opened_at) VALUES (?,?,?,?,?)')
    .bind(objectiveId, String(capability_id).toLowerCase(), String(owner).slice(0, 60), 'OPEN', Number(now)).run();
  return { opened: true, resumed: false, code: null, objective_id: objectiveId };
}

// Closing is only allowed once the delivery is verified AND the skill is on
// the canonical bus: otherwise the gap would look solved while nothing shipped.
export async function closeMissingCapabilityObjective(db, { capability_id, descriptor = null } = {}) {
  const objectiveId = missingCapabilityObjectiveId(capability_id);
  if (!descriptor || descriptor.capability_id !== String(capability_id).toLowerCase() || !Number(descriptor.ci_run_id)) {
    return { closed: false, code: 'MISSING_CAPABILITY_DELIVERY_UNVERIFIED', objective_id: objectiveId };
  }
  await db.prepare('UPDATE mel_capability_gap_objectives SET status=? WHERE id=?').bind('CLOSED', objectiveId).run();
  return { closed: true, code: null, objective_id: objectiveId, registered_on_bus: true };
}
