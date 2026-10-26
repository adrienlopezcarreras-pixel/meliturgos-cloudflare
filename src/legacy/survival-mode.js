// Survival mode (owner rule, 26/10). After one year without a single owner
// message, MEL keeps living on her own: she approves every watch proposal,
// installs every revenue source, runs MAX at full autonomy and repairs
// everything herself. The owner's next chat message ends survival at once:
// the state is recomputed from the owner's last message on every check.
// The zero-spend neuron cap stays: with nobody left, nothing may be billed.

export const SURVIVAL_AFTER_MS = 365 * 86_400_000;

export async function readSurvivalState(db, { now = Date.now() } = {}) {
  if (!db?.prepare) return { active: false, status: 'UNKNOWN_NO_DB' };
  try {
    const row = await db.prepare("SELECT max(timestamp) AS last FROM archive_messages WHERE role = 'user'").first();
    const last = Number(row?.last || 0);
    // No owner message ever recorded proves nothing: never enter survival on it.
    if (!last) return { active: false, status: 'NO_OWNER_HISTORY', last_owner_message_at: null };
    const silence = now - last;
    return {
      active: silence >= SURVIVAL_AFTER_MS,
      status: silence >= SURVIVAL_AFTER_MS ? 'SURVIVAL' : 'OWNER_PRESENT',
      last_owner_message_at: new Date(last).toISOString(),
      survival_starts_at: new Date(last + SURVIVAL_AFTER_MS).toISOString(),
    };
  } catch { return { active: false, status: 'UNKNOWN_READ_FAILED' }; }
}

/** Daily, while in survival: decide everything the owner used to decide. */
export async function runSurvivalMode(env, deps = {}, { now = Date.now() } = {}) {
  const state = await (deps.readSurvivalState || readSurvivalState)(env?.DB, { now });
  if (!state.active) return { ok: true, ...state, actions: [] };
  const actions = [];
  const attempt = async (name, fn) => {
    try { actions.push({ name, ok: true, result: await fn() }); }
    catch (error) { actions.push({ name, ok: false, error: String(error?.code || error?.message || 'FAILED').slice(0, 160) }); }
  };
  await attempt('max-autonomy', () => deps.setMaxAutonomy(env.DB));
  await attempt('approve-watch', async () => {
    const status = await deps.getWatchStatus(env);
    const pending = (status?.discoveries?.items || []).filter(item => !item?.owner_decision?.status && item?.fingerprint);
    let approved = 0;
    for (const item of pending.slice(0, 20)) {
      await deps.approveProposal(env, item.fingerprint);
      approved++;
    }
    return { approved };
  });
  await attempt('install-revenue', () => deps.installRevenue(env));
  return { ok: actions.every(row => row.ok), ...state, actions };
}
