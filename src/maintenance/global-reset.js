// MEL maintenance: inventory without data mutation. Never call production resets
// until an owner-authorized, independently verified restore point exists.
export const RESET_SCOPES = Object.freeze([
  'MAX', 'WORK', 'VEILLE', 'MENTOR', 'COUNCIL', 'FOUNDER', 'PLANIFICATEUR',
]);
const TABLES = Object.freeze([
  'dev_jobs', 'dev_bridge_state', 'work_dags', 'work_dag_run_leases',
  'mel_work_cycles', 'capability_watch_state', 'revenue_watch',
]);
const IDENT = /^[a-z][a-z0-9_]*$/;

export async function inspectMaintenanceStorage(db) {
  if (!db || typeof db.prepare !== 'function') throw Error('MAINTENANCE_DB_MISSING');
  const result = {};
  for (const table of TABLES) {
    if (!IDENT.test(table)) throw Error('MAINTENANCE_INVALID_TABLE');
    const exists = await db.prepare(
      'SELECT name FROM sqlite_master WHERE type = ? AND name = ?'
    ).bind('table', table).first();
    if (!exists) {
      result[table] = { exists: false, rows: null };
      continue;
    }
    const counts = await db.prepare('SELECT COUNT(*) AS n FROM ' + table).first();
    result[table] = { exists: true, rows: Number(counts?.n || 0) };
  }
  return { status: 'READ_ONLY', tables: result, scopes: RESET_SCOPES };
}

export function validateMaintenanceAuthorization(input) {
  if (input?.owner_approved !== true) throw Error('MAINTENANCE_OWNER_APPROVAL_REQUIRED');
  if (input?.producers_paused !== true) throw Error('MAINTENANCE_PRODUCERS_MUST_BE_PAUSED');
  if (input?.backup?.verified !== true ||
      input?.backup?.restore_tested !== true ||
      typeof input?.backup?.reference !== 'string' ||
      !input.backup.reference.trim() ||
      typeof input?.backup?.sha256 !== 'string' ||
      !/^[a-f0-9]{64}$/i.test(input.backup.sha256)) {
    throw Error('MAINTENANCE_VERIFIED_RESTORE_POINT_REQUIRED');
  }
  return true;
}

// This is an intentional guardrail: a D1 backup receipt is NOT, by itself,
// sufficient evidence to cancel WORK submissions, release active leases or
// clear watch ledgers. Each domain must supply a tested, idempotent reset
// handler and a producer-generation fence before activation.
export async function prepareGlobalReset(db, input) {
  validateMaintenanceAuthorization(input);
  await assertNoActiveWorkLeases(db);
  const inventory = await inspectMaintenanceStorage(db);
  return {
    ok: true,
    mode: 'PREFLIGHT_ONLY',
    mutated: false,
    inventory,
    pending: RESET_SCOPES.map(scope => ({
      scope, status: 'BLOCKED_UNTIL_DOMAIN_RESET_HANDLER_VERIFIED'
    })),
    preserves: ['roadmap', 'DONE_VERIFIED', 'memory', 'conversations',
      'verified_payments', 'delivery_evidence', 'backups'],
  };
}

// Strictly bounded epoch transition: archive statuses, do not delete data.
// The caller must provide a verified restore and hold all producer leases.
// This function only handles legacy supervised development jobs.
export async function retireLegacyDevJobs(db, input, { now = Date.now() } = {}) {
  validateMaintenanceAuthorization(input);
  if (!Number.isSafeInteger(now) || now <= 0) throw Error('MAINTENANCE_INVALID_EPOCH');
  const old = await db.prepare(
    "SELECT COUNT(*) AS n FROM dev_jobs WHERE status NOT IN ('COMPLETED','COMMITTED','CANCELLED','FAILED') AND (requested_by='mel-autonomy' OR requested_by LIKE 'owner-chat%' OR requested_by LIKE 'mel-founder%')"
  ).first();
  if (typeof db.batch !== 'function') throw Error('MAINTENANCE_ATOMIC_BATCH_REQUIRED');
  // The cancellation and visibility epoch must commit together.
  const statements = [
    db.prepare(
      "UPDATE dev_jobs SET status='CANCELLED', updated_at=?, error='OWNER_GLOBAL_MAINTENANCE_RESET' WHERE status NOT IN ('COMPLETED','COMMITTED','CANCELLED','FAILED') AND (requested_by='mel-autonomy' OR requested_by LIKE 'owner-chat%' OR requested_by LIKE 'mel-founder%')"
    ).bind(now),
    db.prepare(
      "INSERT INTO dev_bridge_state(bridge_id,last_seen,status,metadata_json) VALUES(?,?,?,?) ON CONFLICT(bridge_id) DO UPDATE SET last_seen=excluded.last_seen,status=excluded.status,metadata_json=excluded.metadata_json"
    ).bind('activity-list-epoch',now,'RESET',JSON.stringify({ reason:'owner-global-maintenance-reset', at: new Date(now).toISOString() })),
  ];
  const results = await db.batch(statements);
  const changes = Number(results?.[0]?.meta?.changes);
  if (!Number.isSafeInteger(changes) || changes < 0) throw Error('MAINTENANCE_DEV_RESET_UNVERIFIED');
  return { status:'CANCELLED_ACTIVE', before:Number(old?.n||0), changed:changes, epoch:now, history_deleted:false };
}

// Discovery reset preserves the old serialized ledger in an immutable-by-policy
// maintenance archive before replacing the active projection. This operation
// requires the scheduler to be stopped independently.
export async function resetWatchDiscoveryProjection(db, input, { now = Date.now() } = {}) {
  validateMaintenanceAuthorization(input);
  if (!Number.isSafeInteger(now) || now <= 0) throw Error('MAINTENANCE_INVALID_EPOCH');
  const id = 'ecosystem-discoveries-canonical';
  const row = await db.prepare('SELECT state_json FROM capability_watch_state WHERE id=?').bind(id).first();
  if (!row?.state_json) return { status:'EMPTY', scope:'VEILLE', active_discoveries:0, archive_id:null };
  const original = String(row.state_json);
  let current;
  try { current = JSON.parse(original); } catch { throw Error('MAINTENANCE_WATCH_LEDGER_CORRUPT'); }
  await db.prepare('CREATE TABLE IF NOT EXISTS mel_maintenance_watch_archives (id TEXT PRIMARY KEY, source_id TEXT NOT NULL, state_json TEXT NOT NULL, archived_at INTEGER NOT NULL)').run();
  const archiveId = 'watch-reset-' + now + '-' + crypto.randomUUID();
  // Old discoveries and their handoffs remain archived, never represented
  // as actionable after the new generation starts.
  const empty = JSON.stringify({ ...current, items:[], maintenance_epoch:now, previous_archive_id:archiveId });
  if (typeof db.batch !== 'function') throw Error('MAINTENANCE_ATOMIC_BATCH_REQUIRED');
  const results = await db.batch([
    db.prepare('INSERT INTO mel_maintenance_watch_archives(id,source_id,state_json,archived_at) VALUES(?,?,?,?)').bind(archiveId,id,original,now),
    db.prepare('UPDATE capability_watch_state SET state_json=?, updated_at=? WHERE id=? AND state_json=?').bind(empty,now,id,original),
  ]);
  if (Number(results?.[1]?.meta?.changes || 0) !== 1) throw Error('MAINTENANCE_WATCH_CONCURRENT_CHANGE');
  return { status:'RESET', scope:'VEILLE', active_discoveries:0, archive_id:archiveId };
}

// Revenue discovery watch is not the payments ledger: only discovery-only
// rows are made inert; verified payouts, invoices and delivered work stay put.
export async function retireRevenueDiscoveries(db, input, { now = Date.now() } = {}) {
  validateMaintenanceAuthorization(input);
  if (!Number.isSafeInteger(now) || now <= 0) throw Error('MAINTENANCE_INVALID_EPOCH');
  const exists = await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='revenue_watch'").first();
  if (!exists) return { status:'NOT_INITIALIZED', changed:0 };
  const result = await db.prepare("UPDATE revenue_watch SET status='ARCHIVED_MAINTENANCE' WHERE status IN ('NEW','DISCOVERY_ONLY')").run();
  return { status:'ARCHIVED', changed:Number(result?.meta?.changes||0), historic_rows_deleted:0 };
}

// Read-only WORK inventory: the serialized DAG is integrity signed and must
// NOT be edited with a raw SQL UPDATE. A live worker may hold a D1 lease.
// Count statuses only; any future cancellation must run through the store
// and fence existing leases before changing the signed record.
export async function inspectWorkDagsForReset(db) {
  if (!db?.prepare) throw Error('MAINTENANCE_DB_MISSING');
  const exists = await db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='work_dags'"
  ).first();
  if (!exists) return { exists:false, statuses:[], total:0 };
  const rows = (await db.prepare(
    'SELECT status, COUNT(*) AS n FROM work_dags GROUP BY status'
  ).all())?.results || [];
  return {
    exists:true,
    total: rows.reduce((sum,row)=>sum+Number(row.n||0),0),
    statuses:rows.map(row=>({status:String(row.status),count:Number(row.n||0)}))
  };
}

// Refuse a global reset while any WORK lease may still be writing.
// This is a runtime assertion, not a replacement for producer shutdown.
export async function assertNoActiveWorkLeases(db, { now = Date.now() } = {}) {
  if (!db?.prepare) throw Error('MAINTENANCE_DB_MISSING');
  const leaseTable = await db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='work_dag_run_leases'"
  ).first();
  if (!leaseTable) return {active:0, status:'LEASE_TABLE_ABSENT'};
  const row = await db.prepare(
    'SELECT COUNT(*) AS n FROM work_dag_run_leases WHERE lease_until > ?'
  ).bind(now).first();
  const count = Number(row?.n);
  if (!Number.isSafeInteger(count) || count < 0) throw Error('MAINTENANCE_WORK_LEASE_COUNT_UNVERIFIED');
  if (count !== 0) throw Error('MAINTENANCE_WORK_LEASES_ACTIVE');
  return {active:0, status:'NO_ACTIVE_WORK_LEASES'};
}

// Explicit operational readiness: no client flags can prove a production
// restore test, global producer freeze, or coverage of every domain handler.
export function globalCleanupReadiness({ restoreTestProof = null, producerFenceProof = null, domainProofs = {} } = {}) {
  const blockers = [];
  if (restoreTestProof?.verified !== true || restoreTestProof?.isolated_restore_tested !== true ||
      !String(restoreTestProof?.reference || '').trim()) blockers.push('RESTORE_TEST_NOT_VERIFIED');
  if (producerFenceProof?.verified !== true || producerFenceProof?.all_producers_stopped !== true ||
      !String(producerFenceProof?.reference || '').trim()) blockers.push('PRODUCER_FENCE_NOT_VERIFIED');
  for (const scope of RESET_SCOPES) {
    if (domainProofs?.[scope]?.tested !== true || domainProofs?.[scope]?.idempotent !== true ||
        domainProofs?.[scope]?.generation_fenced !== true) {
      blockers.push('DOMAIN_RESET_NOT_PROVEN:' + scope);
    }
  }
  return { ready:blockers.length === 0, blockers };
}

/**
 * Read-only backup preflight. Snapshot verification is integrity checking,
 * NOT a tested restore. Do not convert this report to production deletion
 * authorization without independent isolated-restore evidence.
 */
export async function inspectBackupReadiness(backupService) {
  if (!backupService || typeof backupService.list !== 'function' ||
      typeof backupService.verify !== 'function') {
    return { verified:false, restore_tested:false, status:'BACKUP_SERVICE_UNAVAILABLE' };
  }
  const snapshots = await backupService.list({limit:1});
  const latest = Array.isArray(snapshots) ? snapshots[0] : null;
  if (!latest?.id) return {verified:false,restore_tested:false,status:'NO_BACKUP_SNAPSHOT'};
  const proof = await backupService.verify({id:latest.id});
  return {
    verified:proof?.ok === true,
    restore_tested:false,
    status:proof?.ok === true ? 'BACKUP_INTEGRITY_VERIFIED_RESTORE_UNPROVEN' : 'BACKUP_INTEGRITY_FAILED',
    snapshot_id:String(latest.id),
    created_at:latest.createdAt || null,
  };
}
