const WATCHDOG_KEY = 'runtime-watchdog:max-progress';
const STALL_LIMIT = 3;

function parseMetadata(value) {
  if (!value) return {};
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch { return {}; }
}

function baseState() {
  return {
    status: 'UNKNOWN',
    tripped: false,
    consecutive_stalls: 0,
    stall_limit: STALL_LIMIT,
    last_tick_at: null,
    last_advanced_at: null,
    last_block_reason: null,
    last_job_id: null,
    last_job_status: null,
    work_remaining: null,
    waiting_external: false,
    counters: {
      ticks: 0,
      advanced_ticks: 0,
      jobs_created: 0,
      jobs_completed: 0,
      blocked_ticks: 0,
      lease_busy_skips: 0,
    },
  };
}

function normalize(raw = {}) {
  const initial = baseState();
  const counters = raw?.counters && typeof raw.counters === 'object' ? raw.counters : {};
  return {
    ...initial,
    ...raw,
    tripped: raw?.tripped === true,
    consecutive_stalls: Math.max(0, Number(raw?.consecutive_stalls || 0)),
    stall_limit: STALL_LIMIT,
    waiting_external: raw?.waiting_external === true,
    counters: {
      ...initial.counters,
      ...Object.fromEntries(Object.entries(counters).map(([key, value]) => [key, Math.max(0, Number(value || 0))])),
    },
  };
}

export async function readAutonomyProgressWatchdog(db = null) {
  if (!db || typeof db.prepare !== 'function') return baseState();
  try {
    const row = await db.prepare('SELECT status,metadata_json,last_seen FROM dev_bridge_state WHERE bridge_id=?')
      .bind(WATCHDOG_KEY)
      .first();
    if (!row) return baseState();
    const state = normalize(parseMetadata(row.metadata_json));
    state.status = String(row.status || state.status || 'UNKNOWN');
    state.last_seen = Number(row.last_seen || 0) || null;
    return state;
  } catch {
    return baseState();
  }
}

export async function resetAutonomyProgressWatchdog(db = null, {
  status = 'DISABLED',
  now = Date.now(),
} = {}) {
  const state = {
    ...baseState(),
    status,
    last_tick_at: new Date(now).toISOString(),
  };
  if (!db || typeof db.prepare !== 'function') return state;
  await db.prepare(`
    INSERT INTO dev_bridge_state(bridge_id,last_seen,status,metadata_json)
    VALUES(?,?,?,?)
    ON CONFLICT(bridge_id) DO UPDATE SET
      last_seen=excluded.last_seen,
      status=excluded.status,
      metadata_json=excluded.metadata_json
  `).bind(WATCHDOG_KEY, now, status, JSON.stringify(state)).run();
  return state;
}

export async function recordAutonomyProgressWatchdog(db = null, tick = {}, {
  maxAutonomy = false,
  now = Date.now(),
} = {}) {
  if (!maxAutonomy) return resetAutonomyProgressWatchdog(db, { status: 'DISABLED', now });

  const previous = await readAutonomyProgressWatchdog(db);
  const progress = tick?.progress && typeof tick.progress === 'object' ? tick.progress : {};
  const advanced = tick?.advanced === true || progress.advanced === true;
  const workRemaining = progress.work_remaining === true;
  const waitingExternal = progress.waiting_external === true;
  const leaseBusy = String(tick?.status || '').toUpperCase() === 'SKIPPED_LEASE_BUSY';
  const explicitBlock = String(progress.block_reason || tick?.reason || tick?.status || '').slice(0, 180) || null;
  // A live lease means another heartbeat owns the runtime. Do not call that
  // a MAX stall yet: the Actions runner retries the lease explicitly and fails
  // closed if it never clears.
  const shouldStall = workRemaining && !advanced && !leaseBusy && !waitingExternal;

  const counters = {
    ...previous.counters,
    ticks: Number(previous.counters?.ticks || 0) + 1,
    advanced_ticks: Number(previous.counters?.advanced_ticks || 0) + (advanced ? 1 : 0),
    jobs_created: Number(previous.counters?.jobs_created || 0) + (Array.isArray(progress.events) && progress.events.includes('JOB_CREATED') ? 1 : 0),
    jobs_completed: Number(previous.counters?.jobs_completed || 0) + (Array.isArray(progress.events) && progress.events.includes('JOB_COMPLETED') ? 1 : 0),
    blocked_ticks: Number(previous.counters?.blocked_ticks || 0) + (shouldStall ? 1 : 0),
    lease_busy_skips: Number(previous.counters?.lease_busy_skips || 0) + (leaseBusy ? 1 : 0),
  };

  const consecutiveStalls = shouldStall ? Number(previous.consecutive_stalls || 0) + 1 : 0;
  const tripped = workRemaining && consecutiveStalls >= STALL_LIMIT;
  const status = tripped
    ? 'STALLED'
    : advanced
      ? 'ADVANCING'
      : leaseBusy
        ? 'LEASE_BUSY'
        : workRemaining
          ? (waitingExternal ? 'WAITING_EXTERNAL' : 'NO_PROGRESS')
          : 'IDLE';

  const state = {
    status,
    tripped,
    consecutive_stalls: consecutiveStalls,
    stall_limit: STALL_LIMIT,
    last_tick_at: new Date(now).toISOString(),
    last_advanced_at: advanced ? new Date(now).toISOString() : previous.last_advanced_at || null,
    last_block_reason: advanced ? null : explicitBlock,
    last_job_id: progress.job_id || null,
    last_job_status: progress.job_status || null,
    work_remaining: workRemaining,
    waiting_external: waitingExternal,
    counters,
  };

  if (db && typeof db.prepare === 'function') {
    await db.prepare(`
      INSERT INTO dev_bridge_state(bridge_id,last_seen,status,metadata_json)
      VALUES(?,?,?,?)
      ON CONFLICT(bridge_id) DO UPDATE SET
        last_seen=excluded.last_seen,
        status=excluded.status,
        metadata_json=excluded.metadata_json
    `).bind(WATCHDOG_KEY, now, status, JSON.stringify(state)).run();
  }
  return state;
}

export { WATCHDOG_KEY as AUTONOMY_PROGRESS_WATCHDOG_KEY, STALL_LIMIT as AUTONOMY_PROGRESS_STALL_LIMIT };
