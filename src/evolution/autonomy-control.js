import { migrate } from '../persistence/migrations.js';

const CONTROL_ID = 'mel-autonomy-control';
let memoryControl = {
  paused: false,
  status: 'RUNNING',
  updated_at: null,
  source: 'default',
  reason: null,
};

function parseMetadata(value) {
  if (!value) return {};
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch { return {}; }
}

export async function getAutonomyControl(db) {
  if (!db) return { ...memoryControl };
  await migrate(db);
  const row = await db.prepare('SELECT status,last_seen,metadata_json FROM dev_bridge_state WHERE bridge_id=?')
    .bind(CONTROL_ID)
    .first();
  if (!row) {
    return {
      paused: false,
      status: 'RUNNING',
      updated_at: null,
      source: 'default',
      reason: null,
    };
  }
  const metadata = parseMetadata(row.metadata_json);
  const status = String(row.status || 'RUNNING').toUpperCase();
  return {
    paused: status === 'PAUSED',
    status,
    updated_at: metadata.updated_at ?? row.last_seen ?? null,
    source: metadata.source || 'runtime',
    reason: metadata.reason || null,
  };
}

export async function setAutonomyControl(db, { paused = false, source = 'owner-ui', reason = null } = {}) {
  const next = {
    paused: paused === true,
    status: paused === true ? 'PAUSED' : 'RUNNING',
    updated_at: Date.now(),
    source: String(source || 'owner-ui').slice(0, 100),
    reason: reason ? String(reason).slice(0, 500) : null,
  };

  if (!db) {
    memoryControl = next;
    return { ...next };
  }

  await migrate(db);
  await db.prepare(`
    INSERT INTO dev_bridge_state(bridge_id,last_seen,status,metadata_json)
    VALUES(?,?,?,?)
    ON CONFLICT(bridge_id) DO UPDATE SET
      last_seen=excluded.last_seen,
      status=excluded.status,
      metadata_json=excluded.metadata_json
  `).bind(CONTROL_ID, next.updated_at, next.status, JSON.stringify(next)).run();
  return next;
}

export function resetAutonomyControlForTests() {
  memoryControl = {
    paused: false,
    status: 'RUNNING',
    updated_at: null,
    source: 'default',
    reason: null,
  };
}
