import { migrate } from '../persistence/migrations.js';

const CONTROL_ID = 'mel-autonomy-control';

export function isReleaseAutonomyPause(control) {
  return control?.paused === true
    && ['release-predeploy-binder', 'release-launch-bootstrap'].includes(control.source)
    && ['predeploy-release-safety', 'NEW_RELEASE_AWAITING_OWNER_LAUNCH'].includes(control.reason);
}

// A rollback MUST stop MAX while the Worker code is swapped under it: the
// release workflow refuses to roll back without proving that paused state.
// What it must not do is destroy the owner's choice. Before 02/11 the rollback
// source was not recognised here, so max_remembered was wiped and MAX could
// only come back by hand — a failed smoke probe left MEL stopped all night.
// The pause stays; only the owner's intent now survives it.
export const ROLLBACK_PAUSE_SOURCE = 'release-rollback-restore';
export const ROLLBACK_PAUSE_REASON = 'restore-predeploy-autonomy-state';
// A failed release rolls MAX back; MAX then resumes by itself. The only stop
// that is never auto-resumed is one the OWNER sets by hand — their kill switch
// must always win (MEL-SEC-04). The deploy pipeline (CI + Council review +
// production smoke) already stops bad CODE from sticking, so resuming on the
// restored, previously-good version cannot ship anything the Council refused.
// rollback_count is kept for observability (how many times in a row), not as a
// stop: the owner asked that MAX always come back unless they stop it.

export function isRollbackAutonomyPause(control) {
  return control?.paused === true
    && control?.source === ROLLBACK_PAUSE_SOURCE
    && control?.reason === ROLLBACK_PAUSE_REASON;
}

// MAX resumes after a rollback whenever MAX was the owner's live choice. The
// one and only exception is an owner stop, which is never auto-resumed.
export function shouldResumeAfterRollback(control) {
  return isRollbackAutonomyPause(control) && control?.max_remembered === true;
}

// The owner asked for one rule: MAX comes back by itself after a release or a
// rollback. The only stop that stays off is one they set by hand. The short
// predeploy pause is left alone so a release can swap the Worker safely.
export function shouldRestoreOwnerMax(control) {
  if (control?.paused !== true || control?.max_remembered !== true) return false;
  if (control?.reason === 'predeploy-release-safety') return false;
  if (control?.source === 'owner-ui' || control?.reason === 'owner-emergency-stop' || control?.reason === 'owner-stop') return false;
  return shouldResumeAfterRollback(control)
    || (isReleaseAutonomyPause(control) && control.reason === 'NEW_RELEASE_AWAITING_OWNER_LAUNCH');
}

// A release suspends execution, not the owner's choice. Owner/safety stops
// clear that choice; rollback is a safety stop, never an automatic resume.
export function rememberedReleaseMax(control) {
  return (control?.paused !== true && control?.max_autonomy === true)
    || ((isReleaseAutonomyPause(control) || isRollbackAutonomyPause(control)) && control?.max_remembered === true);
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
    rollback_count: 0,
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
    rollback_count: Number(metadata.rollback_count || 0),
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
  const releasePause = paused === true && ['release-predeploy-binder', 'release-launch-bootstrap', ROLLBACK_PAUSE_SOURCE].includes(source);
  const rollbackPause = paused === true && source === ROLLBACK_PAUSE_SOURCE;
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
    // Counts consecutive rollbacks so a flaky release probe cannot loop. Any
    // state the owner sets by hand clears it, because they have looked.
    rollback_count: rollbackPause
      ? Number(current.rollback_count || 0) + 1
      : (String(source || '') === 'owner-ui' || nextMax === true ? 0 : Number(current.rollback_count || 0)),
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

export function resetAutonomyControlForTests(memoryState) {
  if (memoryState && typeof memoryState === 'object') memoryState.control = null;
}
