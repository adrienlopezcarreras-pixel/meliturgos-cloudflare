// MEL starts her own cloud bridge.
//
// When a change is approved and its package is READY while the PC executor is
// offline, the cloud workflow that applies it used to wait for an hourly GitHub
// tick (often skipped, or refused while MEL's own minute tick held the lease).
// After each tick MEL now queues that workflow herself through the existing
// GitHub Action relay (dispatch only; the workflow proves itself with OIDC).
// At most one dispatch per job every 30 minutes.

import { D1GitHubActionRelayStore } from '../platform/github-action-relay.js';

export const CLOUD_BRIDGE_WORKFLOW = 'gen2-42-apply-ready-bridge.yml';
const REDISPATCH_MS = 30 * 60 * 1000;
const EXECUTOR_ONLINE_MS = 60_000;

async function executorOnline(db, now) {
  try {
    const row = await db.prepare("SELECT last_seen,status FROM dev_bridge_state WHERE bridge_id='primary' LIMIT 1").first();
    const age = now - Number(row?.last_seen || 0);
    return Boolean(row) && age >= 0 && age < EXECUTOR_ONLINE_MS && String(row.status || '').toUpperCase() === 'ONLINE';
  } catch { return false; }
}

export async function readyJobFromD1(db) {
  try {
    return await db.prepare(`SELECT id, status FROM dev_jobs WHERE status='TEACHER_APPROVED'
      AND json_extract(result_json,'$.bridge_preparation.status')='READY'
      AND json_extract(result_json,'$.implementation_proposal.status')='READY'
      ORDER BY updated_at ASC LIMIT 1`).first();
  } catch { return null; }
}

export async function maybeDispatchCloudBridge(env, tick, { now = Date.now(), relay = null } = {}) {
  const db = env?.DB;
  if (!db?.prepare) return { status: 'SKIPPED_NO_TICK' };
  tick = tick || {};
  // The tick may stop before reporting the package (e.g. no free model for its
  // runtime proof), so the READY package is also looked up in D1 directly:
  // applying it needs no model at all.
  let job = tick.bridge_preparation?.status === 'READY' && String(tick.job?.status || '').toUpperCase() === 'TEACHER_APPROVED' ? tick.job : null;
  if (!job) job = await readyJobFromD1(db);
  if (!job?.id) return { status: 'SKIPPED_NOT_READY' };
  if (await executorOnline(db, now)) return { status: 'SKIPPED_LOCAL_EXECUTOR_ONLINE' };
  const key = 'cloud-bridge-dispatch:' + String(job.id).slice(0, 160);
  const last = await db.prepare('SELECT last_seen FROM dev_bridge_state WHERE bridge_id=?').bind(key).first().catch(() => null);
  if (last && now - Number(last.last_seen || 0) < REDISPATCH_MS) return { status: 'SKIPPED_RECENTLY_DISPATCHED' };
  const store = relay || new D1GitHubActionRelayStore(db);
  const queued = await store.enqueue({ workflow: CLOUD_BRIDGE_WORKFLOW, ref: 'main', inputs: { job_id: String(job.id), chain_depth: '0' }, now });
  await db.prepare(`INSERT INTO dev_bridge_state(bridge_id,last_seen,status,metadata_json) VALUES(?,?,?,?)
    ON CONFLICT(bridge_id) DO UPDATE SET last_seen=excluded.last_seen,status=excluded.status,metadata_json=excluded.metadata_json`)
    .bind(key, now, 'DISPATCHED', JSON.stringify({ relay_job_id: queued?.id || null, job_id: job.id })).run();
  return { status: 'DISPATCH_QUEUED', relay_job_id: queued?.id || null };
}
