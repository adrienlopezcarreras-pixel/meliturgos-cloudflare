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
