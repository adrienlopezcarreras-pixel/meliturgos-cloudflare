import { migrate } from '../persistence/migrations.js';

const CONTROL_ID = 'mel-autonomy-control';

export function isReleaseAutonomyPause(control) {
  return control?.paused === true
    && ['release-predeploy-binder', 'release-launch-bootstrap'].includes(control.source)
    && ['predeploy-release-safety', 'NEW_RELEASE_AWAITING_OWNER_LAUNCH'].includes(control.reason);
}

// A release suspends execution, not the owner's choice. Owner/safety stops
// clear that choice; rollback is a safety stop, never an automatic resume.
export function rememberedReleaseMax(control) {
  return (control?.paused !== true && control?.max_autonomy === true)
    || (isReleaseAutonomyPause(control) && control?.max_remembered === true);
}

// Technical release pauses may update the row several times without changing
// the owner's intent. Keep that intent's version separate from the CAS clock.
export function ownerControlVersion(control) {
  const version = Number(control?.owner_control_version ?? control?.updated_at);
  return Number.isSafeInteger(version) && version > 0 ? version : null;
}

function defaultControl({ paused = false, source = 'default', reason = null } = {}) {
  return {
    paused: paused === true,
    max_autonomy: false,
    max_remembered: false,
    owner_override: false,
    status: paused === true ? 'PAUSED' : 'RUNNING',
    updated_at: null,
    owner_control_version: null,
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
  const control = value && typeof value === 'object' ? { ...value, owner_control_version: ownerControlVersion(value) } : defaultControl();
  if (control.paused === true) {
    return { ...control, max_autonomy: false, owner_override: false, status: 'PAUSED' };
  }
  return control;
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
  const storedMaxAutonomy = metadata.max_autonomy === true || metadata.owner_override === true || status === 'MAX_AUTONOMY';
  const maxAutonomy = paused ? false : storedMaxAutonomy;
  return {
    paused,
    max_autonomy: maxAutonomy,
    owner_override: maxAutonomy,
    // MAX chosen by the owner, kept while a pause (e.g. a release) is in force.
    max_remembered: metadata.max_remembered === true || storedMaxAutonomy,
    status: paused ? 'PAUSED' : (maxAutonomy ? 'MAX_AUTONOMY' : 'RUNNING'),
    updated_at: metadata.updated_at ?? row.last_seen ?? null,
    owner_control_version: ownerControlVersion({ ...metadata, updated_at: metadata.updated_at ?? row.last_seen }),
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
  expected_updated_at,
} = {}) {
  if (!db && !memoryState) {
    throw Object.assign(new Error('AUTONOMY_CONTROL_DB_REQUIRED'), {
      code: 'AUTONOMY_CONTROL_DB_REQUIRED',
      status: 503,
    });
  }

  const current = await getAutonomyControl(db, { memoryState });
  if (expected_updated_at !== undefined && current.updated_at !== expected_updated_at) {
    throw Object.assign(new Error('AUTONOMY_CONTROL_CHANGED'), { code: 'AUTONOMY_CONTROL_CHANGED', status: 409 });
  }
  const releasePause = paused === true && ['release-predeploy-binder', 'release-launch-bootstrap'].includes(source);
  const protectedPause = releasePause && current.paused === true && !isReleaseAutonomyPause(current);
  const nextPaused = typeof paused === 'boolean' ? paused : current.paused === true;
  const requestedMax = typeof max_autonomy === 'boolean'
    ? max_autonomy
    : (typeof owner_override === 'boolean' ? owner_override : current.max_autonomy === true);
  const nextMax = nextPaused ? false : requestedMax;
  const updatedAt = Math.max(Date.now(), Number(current.updated_at || 0) + 1);
  const next = {
    paused: nextPaused,
    max_autonomy: nextMax,
    max_remembered: nextMax || (releasePause && !protectedPause && rememberedReleaseMax(current)),
    owner_override: nextMax,
    status: nextPaused ? 'PAUSED' : (nextMax ? 'MAX_AUTONOMY' : 'RUNNING'),
    updated_at: updatedAt,
    owner_control_version: releasePause ? ownerControlVersion(current) : updatedAt,
    source: protectedPause ? current.source : String(source || 'owner-ui').slice(0, 100),
    reason: protectedPause ? current.reason : reason === undefined ? (current.reason || null) : (reason ? String(reason).slice(0, 500) : null),
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

  if (expected_updated_at !== undefined || (releasePause && current.updated_at !== null)) {
    const result = await db.prepare(`UPDATE dev_bridge_state
      SET last_seen=?,status=?,metadata_json=?
      WHERE bridge_id=? AND last_seen=? AND status=?
        AND json_extract(metadata_json,'$.source')=?`)
      .bind(next.updated_at, next.status, JSON.stringify(next), CONTROL_ID,
        expected_updated_at ?? current.updated_at, current.status, current.source).run();
    if (Number(result?.meta?.changes ?? result?.changes ?? 0) !== 1) {
      throw Object.assign(new Error('AUTONOMY_CONTROL_CHANGED'), { code: 'AUTONOMY_CONTROL_CHANGED', status: 409 });
    }
    return next;
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
  paused,
  source = 'owner-ui',
  reason = null,
  launch_approved_sha,
  launch_approved_at,
  launch_gate_digest,
  memoryState = null,
} = {}) {
  return setAutonomyControl(db, {
    paused,
    max_autonomy: enabled === true,
    source,
    reason: reason ?? (enabled ? 'owner-max-autonomy' : null),
    launch_approved_sha,
    launch_approved_at,
    launch_gate_digest,
    memoryState,
  });
}

// MEL-UI-AUDIT-04: one view for the MAX buttons, from durable state only.
// Pause/release suspend execution but keep the owner's MAX choice; three
// failures in a row are reported, never turned into an owner decision; an
// external block is neither a success nor a second active mission.
const TERMINAL = new Set(['COMPLETED', 'FAILED', 'CANCELLED', 'REJECTED', 'SUPERSEDED']);
const EXTERNAL = new Set(['BLOCKED_EXTERNAL', 'BLOCKED_HUMAN', 'WAITING_DEPENDENCY', 'WAITING_EXTERNAL']);
export function isExternallyBlockedJob(job) {
  const status = String(job?.status || '').toUpperCase();
  return EXTERNAL.has(status) || /^(?:EXTERNAL_|BLOCKED_EXTERNAL|PHYSICAL_DEVICE_PROOF_REQUIRED)/.test(String(job?.error || ''));
}
export function maxControlView(control, { jobs = [] } = {}) {
  const rows = Array.isArray(jobs) ? jobs : [];
  const live = rows.filter(job => !TERMINAL.has(String(job?.status || '').toUpperCase()));
  const blocked = live.filter(isExternallyBlockedJob);
  const active = live.filter(job => !isExternallyBlockedJob(job) && String(job?.status || '').toUpperCase() !== 'QUEUED');
  const recent = [...rows].sort((a, b) => Number(b?.updated_at || 0) - Number(a?.updated_at || 0)).slice(0, 3);
  const threeFailures = recent.length === 3 && recent.every(job => String(job?.status || '').toUpperCase() === 'FAILED');
  const releasePaused = isReleaseAutonomyPause(control);
  const ownerMax = control?.max_autonomy === true || rememberedReleaseMax(control) || control?.max_remembered === true;
  return {
    status: control?.paused === true ? 'PAUSED' : (control?.max_autonomy === true ? 'MAX_AUTONOMY' : 'RUNNING'),
    owner_max_choice: ownerMax,
    button: control?.paused === true ? (releasePaused ? 'RELEASE_IN_PROGRESS' : 'RESUME') : 'PAUSE',
    buttons_enabled: !releasePaused,
    active_mission: active.length ? String(active[0].id) : null,
    active_mission_count: Math.min(active.length, 1),
    extra_active_detected: active.length > 1,
    externally_blocked: blocked.map(job => String(job.id)),
    three_failures: threeFailures,
  };
}

export function resetAutonomyControlForTests(memoryState) {
  if (memoryState && typeof memoryState === 'object') memoryState.control = null;
}
