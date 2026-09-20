import { migrate } from '../persistence/migrations.js';

const CONTROL_ID = 'mel-autonomy-control';

function defaultControl({ paused = false, source = 'default', reason = null } = {}) {
  return {
    paused: paused === true,
    max_autonomy: false,
    owner_override: false,
    status: paused === true ? 'PAUSED' : 'RUNNING',
    updated_at: null,
    source,
    reason,
    launch_approved_sha: null,
    launch_approved_at: null,
    launch_gate_digest: null,
  };
}

function parseMetadata(value) {
  if (!value) return {};
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch { return {}; }
}

export function createAutonomyControlMemoryState() {
  return { control: null };
}

function readMemoryControl(memoryState) {
  const value = memoryState?.control;
  return value && typeof value === 'object' ? { ...value } : defaultControl();
}

export async function getAutonomyControl(db, { memoryState = null } = {}) {
  if (!db) return readMemoryControl(memoryState);
  await migrate(db);
  const row = await db.prepare('SELECT status,last_seen,metadata_json FROM dev_bridge_state WHERE bridge_id=?')
    .bind(CONTROL_ID)
    .first();
  if (!row) return defaultControl({ paused: true, source: 'default-d1-fail-closed', reason: 'OWNER_ENABLE_REQUIRED' });

  const metadata = parseMetadata(row.metadata_json);
  const status = String(row.status || 'RUNNING').toUpperCase();
  const paused = status === 'PAUSED' || metadata.paused === true;
  const maxAutonomy = metadata.max_autonomy === true || metadata.owner_override === true || status === 'MAX_AUTONOMY';
  return {
    paused,
    max_autonomy: maxAutonomy,
    owner_override: maxAutonomy,
    status: paused ? 'PAUSED' : (maxAutonomy ? 'MAX_AUTONOMY' : 'RUNNING'),
    updated_at: metadata.updated_at ?? row.last_seen ?? null,
    source: metadata.source || 'runtime',
    reason: metadata.reason || null,
    launch_approved_sha: /^[a-f0-9]{40}$/i.test(String(metadata.launch_approved_sha || '')) ? String(metadata.launch_approved_sha).toLowerCase() : null,
    launch_approved_at: metadata.launch_approved_at || null,
    launch_gate_digest: /^[a-f0-9]{64}$/i.test(String(metadata.launch_gate_digest || '')) ? String(metadata.launch_gate_digest).toLowerCase() : null,
  };
}

export async function setAutonomyControl(db, {
  paused,
  max_autonomy,
  owner_override,
  source = 'owner-ui',
  reason,
  launch_approved_sha,
  launch_approved_at,
  launch_gate_digest,
  memoryState = null,
} = {}) {
  if (!db && !memoryState) {
    throw Object.assign(new Error('AUTONOMY_CONTROL_DB_REQUIRED'), {
      code: 'AUTONOMY_CONTROL_DB_REQUIRED',
      status: 503,
    });
  }

  const current = await getAutonomyControl(db, { memoryState });
  const nextPaused = typeof paused === 'boolean' ? paused : current.paused === true;
  const requestedMax = typeof max_autonomy === 'boolean'
    ? max_autonomy
    : (typeof owner_override === 'boolean' ? owner_override : current.max_autonomy === true);
  const next = {
    paused: nextPaused,
    max_autonomy: requestedMax,
    owner_override: requestedMax,
    status: nextPaused ? 'PAUSED' : (requestedMax ? 'MAX_AUTONOMY' : 'RUNNING'),
    updated_at: Date.now(),
    source: String(source || 'owner-ui').slice(0, 100),
    reason: reason === undefined ? (current.reason || null) : (reason ? String(reason).slice(0, 500) : null),
    launch_approved_sha: launch_approved_sha === undefined
      ? (current.launch_approved_sha || null)
      : (/^[a-f0-9]{40}$/i.test(String(launch_approved_sha || '')) ? String(launch_approved_sha).toLowerCase() : null),
    launch_approved_at: launch_approved_at === undefined ? (current.launch_approved_at || null) : (launch_approved_at || null),
    launch_gate_digest: launch_gate_digest === undefined
      ? (current.launch_gate_digest || null)
      : (/^[a-f0-9]{64}$/i.test(String(launch_gate_digest || '')) ? String(launch_gate_digest).toLowerCase() : null),
  };

  if (!db) {
    memoryState.control = { ...next };
    return { ...next };
  }

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

export async function setOwnerMaxAutonomy(db, {
  enabled = true,
  source = 'owner-ui',
  reason = null,
  launch_approved_sha,
  launch_approved_at,
  launch_gate_digest,
  memoryState = null,
} = {}) {
  return setAutonomyControl(db, {
    max_autonomy: enabled === true,
    source,
    reason: reason ?? (enabled ? 'owner-max-autonomy' : null),
    launch_approved_sha,
    launch_approved_at,
    launch_gate_digest,
    memoryState,
  });
}

export function resetAutonomyControlForTests(memoryState) {
  if (memoryState && typeof memoryState === 'object') memoryState.control = null;
}
