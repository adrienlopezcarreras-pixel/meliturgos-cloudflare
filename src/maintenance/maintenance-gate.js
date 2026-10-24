// A read-only D1 maintenance fence shared by independently scheduled producers.
// Fail closed on a D1 read error; missing fence row means normal operation.
export const MAINTENANCE_FENCE_ID = 'mel-global-maintenance-fence';

export async function readMaintenanceFence(db) {
  if (!db?.prepare) return { paused:true, reason:'DB_UNAVAILABLE' };
  try {
    const row = await db.prepare(
      'SELECT status FROM dev_bridge_state WHERE bridge_id=? LIMIT 1'
    ).bind(MAINTENANCE_FENCE_ID).first();
    return { paused:String(row?.status || '').toUpperCase() === 'PAUSED',
      reason:row ? 'GLOBAL_MAINTENANCE' : null };
  } catch {
    return { paused:true, reason:'DB_READ_FAILED' };
  }
}
