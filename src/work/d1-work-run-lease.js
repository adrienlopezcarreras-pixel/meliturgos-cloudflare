// An atomic D1 lease prevents a manual resume and the periodic open-loop
// worker from running the same persistent DAG node concurrently.
// A Worker that crashes leaves a bounded lease; the next invocation may
// recover an idempotent RUNNING node once the lease expires.
export const WORK_RUN_LEASE_TTL_MS = 15 * 60 * 1000;

function leaseError(code) {
  return Object.assign(new Error(code), { code });
}

function assertLeaseInput(db, dagId) {
  if (!db || typeof db.prepare !== 'function') throw leaseError('WORK_DAG_LEASE_DB_REQUIRED');
  if (!String(dagId || '').trim() || String(dagId).length > 200) throw leaseError('WORK_DAG_LEASE_ID_INVALID');
}

async function ensureRunLeaseTable(db) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS work_dag_run_leases (
    dag_id TEXT PRIMARY KEY,
    lease_token TEXT NOT NULL,
    lease_until INTEGER NOT NULL
  )`).run();
}

export async function acquireD1WorkRunLease(db, dagId, {
  now = Date.now(),
  ttlMs = WORK_RUN_LEASE_TTL_MS,
  token = crypto.randomUUID(),
} = {}) {
  assertLeaseInput(db, dagId);
  const timestamp = Number(now);
  const ttl = Number(ttlMs);
  if (!Number.isFinite(timestamp) || !Number.isFinite(ttl) || ttl < 1_000 || ttl > WORK_RUN_LEASE_TTL_MS) {
    throw leaseError('WORK_DAG_LEASE_TIME_INVALID');
  }
  if (!String(token || '').trim()) throw leaseError('WORK_DAG_LEASE_TOKEN_INVALID');
  await ensureRunLeaseTable(db);
  // One SQLite statement performs the test-and-set atomically across Workers:
  // a second worker cannot replace an unexpired lease.
  const result = await db.prepare(`INSERT INTO work_dag_run_leases
    (dag_id, lease_token, lease_until) VALUES (?, ?, ?)
    ON CONFLICT(dag_id) DO UPDATE SET
      lease_token=excluded.lease_token,
      lease_until=excluded.lease_until
    WHERE work_dag_run_leases.lease_until <= ?`)
    .bind(String(dagId), String(token), timestamp + ttl, timestamp).run();
  const changes = Number(result?.meta?.changes);
  if (!Number.isFinite(changes)) throw leaseError('WORK_DAG_LEASE_WRITE_UNVERIFIED');
  if (changes !== 1) return null;
  return { dagId: String(dagId), token: String(token), until: timestamp + ttl };
}

export async function releaseD1WorkRunLease(db, lease) {
  if (!lease) return false;
  assertLeaseInput(db, lease.dagId);
  if (!String(lease.token || '').trim()) throw leaseError('WORK_DAG_LEASE_TOKEN_INVALID');
  // An old worker must never release a replacement worker's lease.
  const result = await db.prepare('DELETE FROM work_dag_run_leases WHERE dag_id=? AND lease_token=?')
    .bind(lease.dagId, lease.token).run();
  const changes = Number(result?.meta?.changes);
  if (!Number.isFinite(changes)) throw leaseError('WORK_DAG_LEASE_RELEASE_UNVERIFIED');
  return changes === 1;
}
