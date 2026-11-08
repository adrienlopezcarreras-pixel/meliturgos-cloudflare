import {
  autonomyControlCasValues, AUTONOMY_CONTROL_CAS_PREDICATE, AUTOMATIC_AUTONOMY_CONTROL_SOURCES,
  ROLLBACK_PAUSE_SOURCE, ROLLBACK_PAUSE_REASON, createAutonomyControlMemoryState,
  readAutonomyControl, setAutonomyControl, ownerControlVersion,
  isOwnerAutonomyStop, shouldRestoreOwnerMax, isTechnicalAutonomyPause,
} from './autonomy-control.js';

// Execute the shared control policy on isolated states and its actual D1 CAS
// predicate through SELECT only. Never pause, resume or write production MAX.
export async function verifyOwnerStopPolicy(env = {}) {
  const fail = code => Object.assign(new Error(code), { code });
  if (!env.DB?.prepare) throw fail('OWNER_STOP_PROOF_DB_UNAVAILABLE');
  const live = await readAutonomyControl(env.DB), version = ownerControlVersion(live);
  if (!version || !Number.isSafeInteger(Number(live.updated_at))) throw fail('OWNER_STOP_PROOF_CONTROL_REQUIRED');
  const base = { paused: true, max_autonomy: false, max_remembered: true, source: 'owner-ui', reason: 'owner-stop',
    status: 'PAUSED', updated_at: Number(live.updated_at), owner_control_version: version, repair: null };
  const states = [base,
    { ...base, paused: false, max_remembered: false, reason: null, status: 'RUNNING' },
    { ...base, source: 'watchdog', reason: 'safety-stop', owner_stopped: true }];
  const sources = [...new Set([...AUTOMATIC_AUTONOMY_CONTROL_SOURCES, 'release-predeploy-binder', 'release-launch-bootstrap', 'future-automatic-writer'])];
  let checks = 0;
  for (const stopped of states) for (const source of sources) {
    const memoryState = createAutonomyControlMemoryState(); memoryState.control = { ...stopped };
    try {
      await setAutonomyControl(null, { paused: false, max_autonomy: true, source, memoryState, expected_updated_at: stopped.updated_at });
    } catch (error) {
      if (source !== 'bridge-repair-lane' || error?.code !== 'AUTONOMY_REPAIR_OWNER_AUTH_REQUIRED') throw fail('OWNER_STOP_RUNTIME_GUARD_FAILED');
    }
    const after = await readAutonomyControl(null, { memoryState });
    if (after.max_autonomy !== false || (source !== 'bridge-repair-lane' && after.paused !== true)
      || shouldRestoreOwnerMax(after) || isTechnicalAutonomyPause(after)
      || (source !== 'bridge-repair-lane' && !isOwnerAutonomyStop(after))) throw fail('OWNER_STOP_RUNTIME_GUARD_FAILED');
    checks++;
  }
  for (const owner of ['owner-ui', 'owner-ui-launch-gate', 'owner-release-command']) {
    const memoryState = createAutonomyControlMemoryState(); memoryState.control = { ...base, owner_stopped: true };
    const after = await setAutonomyControl(null, { paused: false, max_autonomy: true, source: owner, memoryState });
    if (after.paused || !after.max_autonomy || after.owner_stopped === true) throw fail('OWNER_STOP_RUNTIME_GUARD_FAILED');
    checks++;
  }
  const rollback = createAutonomyControlMemoryState();
  rollback.control = { ...base, source: ROLLBACK_PAUSE_SOURCE, reason: ROLLBACK_PAUSE_REASON };
  if (!shouldRestoreOwnerMax(rollback.control)) throw fail('OWNER_STOP_RUNTIME_GUARD_FAILED');
  const restored = await setAutonomyControl(null, { paused: false, max_autonomy: true, source: 'rollback-auto-resume', memoryState: rollback });
  if (!restored.max_autonomy || restored.paused) throw fail('OWNER_STOP_RUNTIME_GUARD_FAILED');
  checks++;

  const expected = autonomyControlCasValues(live);
  const casCases = [[expected, 1], [[expected[0], expected[1] - 1, expected[2], expected[3]], 0],
    [[expected[0], expected[1], 'probe-wrong-status', expected[3]], 0],
    [[expected[0], expected[1], expected[2], 'probe-wrong-source'], 0]];
  for (const [values, accepted] of casCases) {
    const row = await env.DB.prepare(`SELECT COUNT(*) AS n FROM dev_bridge_state WHERE ${AUTONOMY_CONTROL_CAS_PREDICATE}`).bind(...values).first();
    if (Number(row?.n) !== accepted) throw fail('OWNER_STOP_PROOF_CAS_FAILED');
  }
  const after = await readAutonomyControl(env.DB);
  if (after.updated_at !== live.updated_at || ownerControlVersion(after) !== version) throw fail('OWNER_STOP_PROOF_CONTROL_CHANGED');
  return { ok: true, policy_checks: checks, cas_checks: casCases.length };
}
