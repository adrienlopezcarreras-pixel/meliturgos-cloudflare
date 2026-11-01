import { MAINTENANCE_FENCE_ID } from '../maintenance/maintenance-gate.js';
const LEASE_KEY = 'runtime-lease:autonomy-heartbeat';
// The heartbeat runs every minute; an invocation killed before release used to
// block the next 4 ticks (41 of 56 ticks LEASE_BUSY on 18/10). 90 s covers a
// normal tick and frees the lease for the next minute.
const DEFAULT_LEASE_MS = 90 * 1000;
const MIN_LEASE_MS = 60 * 1000;
const MAX_LEASE_MS = 10 * 60 * 1000;

function normalizedLeaseMs(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_LEASE_MS;
  return Math.max(MIN_LEASE_MS, Math.min(MAX_LEASE_MS, Math.trunc(parsed)));
}

function changedRows(result) {
  return Number(result?.meta?.changes ?? result?.changes ?? 0);
}

function ownerStatus(owner) {
  return `LEASED:${String(owner)}`;
}

export async function tryAcquireAutonomyRuntimeLease({
  db = null,
  owner = crypto.randomUUID(),
  leaseMs = DEFAULT_LEASE_MS,
  now = Date.now(),
  memoryStore = null,
} = {}) {
  const acquiredAt = Number(now);
  const expiresAt = acquiredAt + normalizedLeaseMs(leaseMs);
  const ownerId = String(owner);

  if (!db) {
    const store = memoryStore ?? new Map();
    const current = store.get(LEASE_KEY) || null;
    if (current && Number(current.expires_at || 0) > acquiredAt) {
      return { acquired: false, key: LEASE_KEY, expires_at: Number(current.expires_at || 0) };
    }
    store.set(LEASE_KEY, { owner: ownerId, acquired_at: acquiredAt, expires_at: expiresAt });
    return { acquired: true, key: LEASE_KEY, expires_at: expiresAt, owner: ownerId };
  }

  const metadata = JSON.stringify({
    kind: 'AUTONOMY_RUNTIME_LEASE',
    acquired_at: acquiredAt,
    expires_at: expiresAt,
  });
  const result = await db.prepare(`
    INSERT INTO dev_bridge_state(bridge_id,last_seen,status,metadata_json)
    SELECT ?,?,?,?
    WHERE NOT EXISTS (SELECT 1 FROM dev_bridge_state WHERE bridge_id=? AND status='PAUSED')
    ON CONFLICT(bridge_id) DO UPDATE SET
      last_seen=excluded.last_seen,
      status=excluded.status,
      metadata_json=excluded.metadata_json
    WHERE dev_bridge_state.last_seen <= ?
  `).bind(LEASE_KEY, expiresAt, ownerStatus(ownerId), metadata, MAINTENANCE_FENCE_ID, acquiredAt).run();

  if (changedRows(result) === 1) {
    return { acquired: true, key: LEASE_KEY, expires_at: expiresAt, owner: ownerId };
  }

  const current = await db.prepare('SELECT last_seen FROM dev_bridge_state WHERE bridge_id=?')
    .bind(LEASE_KEY)
    .first();
  return { acquired: false, key: LEASE_KEY, expires_at: Number(current?.last_seen || 0) };
}

export async function releaseAutonomyRuntimeLease({
  db = null,
  owner,
  memoryStore = null,
} = {}) {
  const ownerId = String(owner || '');
  if (!ownerId) return false;

  if (!db) {
    if (!memoryStore) return false;
    const current = memoryStore.get(LEASE_KEY) || null;
    if (!current || current.owner !== ownerId) return false;
    memoryStore.delete(LEASE_KEY);
    return true;
  }

  const result = await db.prepare(`
    UPDATE dev_bridge_state
    SET last_seen=0,status='RELEASED',metadata_json='{}'
    WHERE bridge_id=? AND status=?
  `).bind(LEASE_KEY, ownerStatus(ownerId)).run();
  return changedRows(result) === 1;
}

// A tick that waits on models for minutes outlived the 90 s lease: the next
// tick started on the same job and their writes collided (JOB_UPDATE_CONFLICT,
// TEACHER_REQUEST_ALREADY_PENDING on 25/10). The owner extends the lease while
// it is alive; a killed tick stops renewing and the lease still expires.
export async function renewAutonomyRuntimeLease({ db = null, owner, leaseMs = DEFAULT_LEASE_MS, now = Date.now(), memoryStore = null } = {}) {
  const ownerId = String(owner || '');
  if (!ownerId) return false;
  const expiresAt = Number(now) + normalizedLeaseMs(leaseMs);
  if (!db) {
    const current = memoryStore?.get(LEASE_KEY) || null;
    if (!current || current.owner !== ownerId || Number(current.expires_at || 0) <= Number(now)) return false;
    memoryStore.set(LEASE_KEY, { ...current, expires_at: Math.max(Number(current.expires_at), expiresAt) });
    return true;
  }
  const result = await db.prepare(`
    UPDATE dev_bridge_state SET last_seen=MAX(last_seen, ?)
    WHERE bridge_id=? AND status=? AND last_seen > ?
  `).bind(expiresAt, LEASE_KEY, ownerStatus(ownerId), Number(now)).run();
  return changedRows(result) === 1;
}

// A hung tick must not hold the lease forever (26/10: one tick renewed it for
// over an hour and MAX stayed LEASE_BUSY): renewal stops after maxHoldMs.
export function keepAutonomyRuntimeLeaseAlive(args, { everyMs = 30_000, maxHoldMs = MAX_LEASE_MS, now = Date.now } = {}) {
  const until = now() + maxHoldMs;
  const timer = setInterval(() => {
    if (now() > until) { clearInterval(timer); return; }
    renewAutonomyRuntimeLease({ ...args, now: now() }).catch(() => false);
  }, everyMs);
  return () => clearInterval(timer);
}

// MEL-MANIFEST-02: resume recipe. Each step of a mission records a durable
// checkpoint BEFORE its first write (status STARTED) and marks it DONE after
// its last write. A tick killed between two writes leaves STARTED: once the
// lease expires, the next owner resumes that same job and step — never a new
// job — and a step already DONE is skipped, so nothing runs twice.
const CHECKPOINT_KEY = 'runtime-checkpoint:autonomy';

async function readCheckpointRow(db, memoryStore) {
  if (!db) return memoryStore?.get(CHECKPOINT_KEY) || null;
  const row = await db.prepare('SELECT metadata_json FROM dev_bridge_state WHERE bridge_id=?').bind(CHECKPOINT_KEY).first();
  try { return row ? JSON.parse(row.metadata_json || 'null') : null; } catch { return null; }
}

async function writeCheckpointRow(db, memoryStore, value, now) {
  if (!db) { memoryStore.set(CHECKPOINT_KEY, value); return; }
  await db.prepare(`INSERT INTO dev_bridge_state(bridge_id,last_seen,status,metadata_json) VALUES(?,?,?,?)
    ON CONFLICT(bridge_id) DO UPDATE SET last_seen=excluded.last_seen,status=excluded.status,metadata_json=excluded.metadata_json`)
    .bind(CHECKPOINT_KEY, Number(now), value.status, JSON.stringify(value)).run();
}

export async function beginAutonomyCheckpoint({ db = null, memoryStore = null, owner, jobId, step, now = Date.now() } = {}) {
  const current = await readCheckpointRow(db, memoryStore);
  if (current && current.job_id === String(jobId) && current.step === String(step) && current.status === 'DONE') {
    return { run: false, reason: 'STEP_ALREADY_DONE', checkpoint: current };
  }
  const resumed = current?.status === 'STARTED' && current.job_id === String(jobId) && current.step === String(step);
  const next = { job_id: String(jobId), step: String(step), status: 'STARTED', owner: String(owner || ''),
    started_at: resumed ? current.started_at : Number(now), attempts: resumed ? Number(current.attempts || 1) + 1 : 1 };
  await writeCheckpointRow(db, memoryStore, next, now);
  return { run: true, resumed, checkpoint: next };
}

export async function completeAutonomyCheckpoint({ db = null, memoryStore = null, jobId, step, now = Date.now() } = {}) {
  const current = await readCheckpointRow(db, memoryStore);
  if (!current || current.job_id !== String(jobId) || current.step !== String(step)) return false;
  await writeCheckpointRow(db, memoryStore, { ...current, status: 'DONE', done_at: Number(now) }, now);
  return true;
}

// What the next lease owner must do first: the interrupted job/step, if any.
export async function pendingAutonomyCheckpoint({ db = null, memoryStore = null } = {}) {
  const current = await readCheckpointRow(db, memoryStore);
  return current?.status === 'STARTED' ? { job_id: current.job_id, step: current.step, attempts: Number(current.attempts || 1) } : null;
}

export const AUTONOMY_RUNTIME_CHECKPOINT_KEY = CHECKPOINT_KEY;
export const AUTONOMY_RUNTIME_LEASE_KEY = LEASE_KEY;
export const AUTONOMY_RUNTIME_LEASE_MS = DEFAULT_LEASE_MS;
