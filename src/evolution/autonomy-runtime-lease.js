const LEASE_KEY = 'runtime-lease:autonomy-heartbeat';
const DEFAULT_LEASE_MS = 5 * 60 * 1000;
const MIN_LEASE_MS = 60 * 1000;
const MAX_LEASE_MS = 10 * 60 * 1000;
const fallbackLeases = new Map();

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
  memoryStore = fallbackLeases,
} = {}) {
  const acquiredAt = Number(now);
  const expiresAt = acquiredAt + normalizedLeaseMs(leaseMs);
  const ownerId = String(owner);

  if (!db) {
    const current = memoryStore.get(LEASE_KEY) || null;
    if (current && Number(current.expires_at || 0) > acquiredAt) {
      return { acquired: false, key: LEASE_KEY, expires_at: Number(current.expires_at || 0) };
    }
    memoryStore.set(LEASE_KEY, { owner: ownerId, acquired_at: acquiredAt, expires_at: expiresAt });
    return { acquired: true, key: LEASE_KEY, expires_at: expiresAt, owner: ownerId };
  }

  const metadata = JSON.stringify({
    kind: 'AUTONOMY_RUNTIME_LEASE',
    acquired_at: acquiredAt,
    expires_at: expiresAt,
  });
  const result = await db.prepare(`
    INSERT INTO dev_bridge_state(bridge_id,last_seen,status,metadata_json)
    VALUES(?,?,?,?)
    ON CONFLICT(bridge_id) DO UPDATE SET
      last_seen=excluded.last_seen,
      status=excluded.status,
      metadata_json=excluded.metadata_json
    WHERE dev_bridge_state.last_seen <= ?
  `).bind(LEASE_KEY, expiresAt, ownerStatus(ownerId), metadata, acquiredAt).run();

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
  memoryStore = fallbackLeases,
} = {}) {
  const ownerId = String(owner || '');
  if (!ownerId) return false;

  if (!db) {
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

export const AUTONOMY_RUNTIME_LEASE_KEY = LEASE_KEY;
export const AUTONOMY_RUNTIME_LEASE_MS = DEFAULT_LEASE_MS;
