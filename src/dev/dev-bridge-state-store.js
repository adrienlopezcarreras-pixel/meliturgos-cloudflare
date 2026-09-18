import { migrate } from '../persistence/migrations.js';

const SAFE_WORK_BRIDGE_ID = 'safe-work-preflight';

function parseMetadata(raw) {
  if (!raw) return {};
  try {
    const value = JSON.parse(raw);
    return value && typeof value === 'object' ? value : {};
  } catch {
    return {};
  }
}

export async function readLastSafeWorkJob(db) {
  if (!db) return null;
  await migrate(db);
  const row = await db.prepare(
    'SELECT status, metadata_json FROM dev_bridge_state WHERE bridge_id=?'
  ).bind(SAFE_WORK_BRIDGE_ID).first();
  const metadata = parseMetadata(row?.metadata_json);
  return metadata.last_job && typeof metadata.last_job === 'object'
    ? metadata.last_job
    : null;
}

export async function writeLastSafeWorkJob(db, job) {
  if (!db) return false;
  await migrate(db);
  const now = Date.now();
  const status = String(job?.status || 'PREPARED').slice(0, 80);
  const metadata = JSON.stringify({ last_job: job || null });
  await db.prepare(`
    INSERT INTO dev_bridge_state(bridge_id,last_seen,status,metadata_json)
    VALUES(?,?,?,?)
    ON CONFLICT(bridge_id) DO UPDATE SET
      last_seen=excluded.last_seen,
      status=excluded.status,
      metadata_json=excluded.metadata_json
  `).bind(SAFE_WORK_BRIDGE_ID, now, status, metadata).run();
  return true;
}
