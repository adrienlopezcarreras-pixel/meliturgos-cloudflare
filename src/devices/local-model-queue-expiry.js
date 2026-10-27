// Local model commands may outlive the MAX tick which created them.
// Never let an abandoned queued command claim the PC minutes later.
// This is scoped exclusively to session IDs minted by local-pc-model.js.
export const LEGACY_LOCAL_MODEL_MAX_AGE_MS = 600_000;

export function expiredLocalModelCommand(row, now = Date.now()) {
  if (!String(row?.session_id || '').startsWith('local-model-')) return false;
  let plan = null;
  try { plan = JSON.parse(row.plan_json || '{}'); } catch {}
  const explicitDeadline = Number(plan?.expires_at);
  if (Number.isFinite(explicitDeadline) && explicitDeadline > 0 && now >= explicitDeadline) return true;
  const issued = Number(row.created_at);
  return Number.isFinite(issued) && issued > 0 && now - issued >= LEGACY_LOCAL_MODEL_MAX_AGE_MS;
}

export async function expireQueuedLocalModelCommand(db, row, now = Date.now()) {
  if (!expiredLocalModelCommand(row, now)) return false;
  const saved = await db.prepare(
    "UPDATE computer_commands SET status='FAILED',finished_at=?,error_code=? WHERE id=? AND device_id=? AND status='PENDING'"
  ).bind(now, 'LOCAL_MODEL_REQUEST_EXPIRED', row.id, row.device_id).run();
  // Fail closed on an unconfirmed write: do not claim a possibly stale command.
  if (!saved || saved.success === false) throw new Error('LOCAL_MODEL_EXPIRY_WRITE_UNCONFIRMED');
  return true;
}
