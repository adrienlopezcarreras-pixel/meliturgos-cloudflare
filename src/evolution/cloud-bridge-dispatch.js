// MEL starts her own cloud bridge.
//
// When a change is approved and its package is READY while the PC executor is
// offline, the cloud workflow that applies it used to wait for an hourly GitHub
// tick (often skipped, or refused while MEL's own minute tick held the lease).
// After each tick MEL now queues that workflow herself through the existing
// GitHub Action relay (dispatch only; the workflow proves itself with OIDC).
// At most one dispatch per job every 30 minutes.
// CODEX: an already-tested local package also uses this same publisher until
// its canonical GitHub commit exists; the online PC is not asked to redo it.

import { D1GitHubActionRelayStore } from '../platform/github-action-relay.js';
import { isPreparedDevBridgeJob, isUnappliedReadyReviewJob } from '../dev/d1-dev-job-repository.js';

export const CLOUD_BRIDGE_WORKFLOW = 'gen2-42-apply-ready-bridge.yml';
const REDISPATCH_MS = 30 * 60 * 1000;
const EXECUTOR_ONLINE_MS = 60_000;
// [GPT] Heartbeat proves presence, not that the Companion claimed this exact package.
const LOCAL_CLAIM_GRACE_MS = 3 * 60 * 1000;

async function executorOnline(db, now) {
  try {
    const row = await db.prepare("SELECT last_seen,status FROM dev_bridge_state WHERE bridge_id='primary' LIMIT 1").first();
    const age = now - Number(row?.last_seen || 0);
    return Boolean(row) && age >= 0 && age < EXECUTOR_ONLINE_MS && String(row.status || '').toUpperCase() === 'ONLINE';
  } catch { return false; }
}

export async function readyJobFromD1(db) {
  try {
    const rows = (await db.prepare(`SELECT id,status,result_json,files_json,tests_json FROM dev_jobs
      WHERE json_extract(result_json,'$.bridge_preparation.status')='READY'
        AND json_extract(result_json,'$.implementation_proposal.status')='READY'
        AND status IN ('TEACHER_APPROVED','READY_FOR_REVIEW')
      ORDER BY CASE status WHEN 'TEACHER_APPROVED' THEN 0 ELSE 1 END, updated_at ASC
      LIMIT 100`).all()).results || [];
    for (const row of rows) {
      try {
        const job = { ...row,
          result_json: typeof row.result_json === 'string' ? JSON.parse(row.result_json) : row.result_json,
          files_json: typeof row.files_json === 'string' ? JSON.parse(row.files_json) : row.files_json,
          tests_json: typeof row.tests_json === 'string' ? JSON.parse(row.tests_json) : row.tests_json,
        };
        // CODEX: dispatch and atomic claim share one eligibility predicate.
        if (isPreparedDevBridgeJob(job) || isUnappliedReadyReviewJob(job)) {
          return { id: job.id, status: job.status, package_created_at: job.result_json.bridge_preparation.created_at };
        }
      } catch { /* Malformed metadata cannot authorize a publication. */ }
    }
    return null;
  } catch { return null; }
}


async function packageCreatedMs(db, job) {
  const direct = Date.parse(job?.package_created_at || job?.result_json?.bridge_preparation?.created_at || '');
  if (Number.isFinite(direct) && direct > 0) return direct;
  if (!db?.prepare || !job?.id) return 0;
  const row = await db.prepare("SELECT json_extract(result_json,'$.bridge_preparation.created_at') AS package_created_at FROM dev_jobs WHERE id=?").bind(job.id).first().catch(() => null);
  const parsed = Date.parse(row?.package_created_at || '');
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function maybeDispatchCloudBridge(env, tick, { now = Date.now(), relay = null } = {}) {
  const db = env?.DB;
  if (!db?.prepare) return { status: 'SKIPPED_NO_TICK' };
  tick = tick || {};
  // The tick may stop before reporting the package (e.g. no free model for its
  // runtime proof), so the READY package is also looked up in D1 directly:
  // applying it needs no model at all.
  let job = tick.bridge_preparation?.status === 'READY' && ['TEACHER_APPROVED', 'READY_FOR_REVIEW'].includes(String(tick.job?.status || '').toUpperCase()) ? tick.job : null;
  if (!job) job = await readyJobFromD1(db);
  if (!job?.id) return { status: 'SKIPPED_NOT_READY' };
  // [GPT] Give an online local Companion first chance to claim the ready package.
  // If it remains unclaimed past the grace period, the existing atomic claim
  // mechanism will protect execution while the cloud relay restores progress.
  // Without a trustworthy package timestamp, keep the conservative behavior.
  const packageAt = await packageCreatedMs(db, job);
  if (String(job.status || '').toUpperCase() !== 'READY_FOR_REVIEW'
      && await executorOnline(db, now) && (!packageAt || now - packageAt < LOCAL_CLAIM_GRACE_MS)) {
    return { status: 'SKIPPED_LOCAL_EXECUTOR_ONLINE' };
  }
  const key = 'cloud-bridge-dispatch:' + String(job.id).slice(0, 160);
  const last = await db.prepare('SELECT last_seen FROM dev_bridge_state WHERE bridge_id=?').bind(key).first().catch(() => null);
  // The same unchanged package is not sent twice inside 30 minutes.
  // A package created after that dispatch is a new repair and must go out.
  if (last && packageAt <= Number(last.last_seen || 0) && now - Number(last.last_seen || 0) < REDISPATCH_MS) return { status: 'SKIPPED_RECENTLY_DISPATCHED' };
  const store = relay || new D1GitHubActionRelayStore(db);
  const queued = await store.enqueue({ workflow: CLOUD_BRIDGE_WORKFLOW, ref: 'main', inputs: { job_id: String(job.id), chain_depth: '0' }, now });
  await db.prepare(`INSERT INTO dev_bridge_state(bridge_id,last_seen,status,metadata_json) VALUES(?,?,?,?)
    ON CONFLICT(bridge_id) DO UPDATE SET last_seen=excluded.last_seen,status=excluded.status,metadata_json=excluded.metadata_json`)
    .bind(key, now, 'DISPATCHED', JSON.stringify({ relay_job_id: queued?.id || null, job_id: job.id })).run();
  return { status: 'DISPATCH_QUEUED', relay_job_id: queued?.id || null };
}
