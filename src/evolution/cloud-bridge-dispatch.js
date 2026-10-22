// CODEX: approved READY work uses the existing cloud relay as its normal path.
// Windows presence never delays dispatch. Queue receipts are not execution
// proofs; the shared atomic D1 claim arbitrates every actual executor.
// Tested local returns still reuse this publisher until their real GitHub
// candidate commit exists, without asking the PC to redo its work.

import { D1GitHubActionRelayStore } from '../platform/github-action-relay.js';
import { isPreparedDevBridgeJob, isUnappliedReadyReviewJob } from '../dev/d1-dev-job-repository.js';

export const CLOUD_BRIDGE_WORKFLOW = 'gen2-42-apply-ready-bridge.yml';
const REDISPATCH_MS = 30 * 60 * 1000;
// CODEX: presence of a PC is neither scheduling priority nor owner consent.
export function companionFallbackAuthorized(env = {}) {
  return env.MEL_COMPANION_FALLBACK_ALLOWED === true || env.MEL_COMPANION_FALLBACK_ALLOWED === 'true';
}

export async function localBridgeFallbackAllowed(env, job, { now = Date.now() } = {}) {
  if (!companionFallbackAuthorized(env) || !job?.id || !env?.DB?.prepare) return false;
  const row = await env.DB.prepare('SELECT status,last_seen,metadata_json FROM dev_bridge_state WHERE bridge_id=?')
    .bind('cloud-bridge-dispatch:' + String(job.id).slice(0, 160)).first().catch(() => null);
  let metadata;
  try { metadata = JSON.parse(row?.metadata_json || '{}'); } catch { return false; }
  const prep = job?.result_json?.bridge_preparation;
  return row?.status === 'CLOUD_UNAVAILABLE' && now >= Number(row.last_seen)
    && now - Number(row.last_seen) < REDISPATCH_MS
    && Boolean(prep?.created_at && prep?.candidate_sha)
    && metadata.package_created_at === prep.created_at && metadata.candidate_sha === prep.candidate_sha;
}

export async function readyJobsFromD1(db) {
  try {
    const rows = (await db.prepare(`SELECT id,status,result_json,files_json,tests_json FROM dev_jobs
      WHERE json_extract(result_json,'$.bridge_preparation.status')='READY'
        AND json_extract(result_json,'$.implementation_proposal.status')='READY'
        AND status IN ('TEACHER_APPROVED','READY_FOR_REVIEW')
      ORDER BY CASE status WHEN 'TEACHER_APPROVED' THEN 0 ELSE 1 END, updated_at ASC
      LIMIT 100`).all()).results || [];
    const ready = [];
    for (const row of rows) {
      try {
        const job = { ...row,
          result_json: typeof row.result_json === 'string' ? JSON.parse(row.result_json) : row.result_json,
          files_json: typeof row.files_json === 'string' ? JSON.parse(row.files_json) : row.files_json,
          tests_json: typeof row.tests_json === 'string' ? JSON.parse(row.tests_json) : row.tests_json,
        };
        // CODEX: dispatch and atomic claim share one eligibility predicate.
        if (isPreparedDevBridgeJob(job) || isUnappliedReadyReviewJob(job)) {
          ready.push({ id: job.id, status: job.status, package_created_at: job.result_json.bridge_preparation.created_at, candidate_sha: job.result_json.bridge_preparation.candidate_sha });
        }
      } catch { /* Malformed metadata cannot authorize a publication. */ }
    }
    return ready;
  } catch { return []; }
}

// Keep the single-job API for callers that need to inspect the first ready job.
export async function readyJobFromD1(db) {
  return (await readyJobsFromD1(db))[0] || null;
}


async function packageCreatedMs(db, job) {
  const direct = Date.parse(job?.package_created_at || job?.result_json?.bridge_preparation?.created_at || '');
  if (Number.isFinite(direct) && direct > 0) return direct;
  if (!db?.prepare || !job?.id) return 0;
  const row = await db.prepare("SELECT json_extract(result_json,'$.bridge_preparation.created_at') AS package_created_at FROM dev_jobs WHERE id=?").bind(job.id).first().catch(() => null);
  const parsed = Date.parse(row?.package_created_at || '');
  return Number.isFinite(parsed) ? parsed : 0;
}

async function recordCloudUnavailable(db, job, key, now, code) {
  await db.prepare(`INSERT INTO dev_bridge_state(bridge_id,last_seen,status,metadata_json) VALUES(?,?,?,?)
    ON CONFLICT(bridge_id) DO UPDATE SET last_seen=excluded.last_seen,status=excluded.status,metadata_json=excluded.metadata_json`)
    .bind(key, now, 'CLOUD_UNAVAILABLE', JSON.stringify({ job_id: job.id,
      package_created_at: job.package_created_at || job.result_json?.bridge_preparation?.created_at || null,
      candidate_sha: job.candidate_sha || job.result_json?.bridge_preparation?.candidate_sha || null, code })).run();
  return { status: 'CLOUD_UNAVAILABLE', code, job_id: job.id };
}

export async function maybeDispatchCloudBridge(env, tick, { now = Date.now(), relay = null } = {}) {
  const db = env?.DB;
  if (!db?.prepare) return { status: 'SKIPPED_NO_TICK' };
  // [ChatGPT-GPT6 / MEL-CODE-MAX-HANDOFF] D1, not a stale MAX tick,
  // decides which Teacher-approved package is eligible for cloud execution.
  // A previously queued job cannot starve a second independent READY job.
  const candidates = await readyJobsFromD1(db);
  if (!candidates.length) return { status: 'SKIPPED_NOT_READY' };
  const store = relay || new D1GitHubActionRelayStore(db);
  let job = null, key = '', last = null, packageAt = 0;
  let unavailable = null;
  for (const candidate of candidates) {
    const candidateKey = 'cloud-bridge-dispatch:' + String(candidate.id).slice(0, 160);
    const state = await db.prepare('SELECT last_seen,status,metadata_json FROM dev_bridge_state WHERE bridge_id=?')
      .bind(candidateKey).first().catch(() => null);
    let metadata = {};
    try { metadata = JSON.parse(state?.metadata_json || '{}'); } catch { /* fail closed for fallback */ }
    // A FAILED relay receipt is not code execution. Record the failure, but
    // allow other independent jobs to advance during the retry cooldown.
    if (state?.status === 'QUEUED' && metadata.relay_job_id && typeof store.get === 'function'
        && metadata.package_created_at === candidate.package_created_at
        && metadata.candidate_sha === candidate.candidate_sha) {
      const prior = await store.get(metadata.relay_job_id).catch(() => null);
      if (prior?.status === 'FAILED') {
        unavailable = await recordCloudUnavailable(db, candidate, candidateKey, now, 'CLOUD_RELAY_DISPATCH_FAILED');
        continue;
      }
    }
    const createdMs = await packageCreatedMs(db, candidate);
    const stateAt = Number(state?.last_seen || 0);
    if (state && createdMs <= stateAt && now >= stateAt && now - stateAt < REDISPATCH_MS) continue;
    job = candidate; key = candidateKey; last = state; packageAt = createdMs;
    break;
  }
  if (!job) return unavailable || { status: 'SKIPPED_RECENTLY_DISPATCHED' };
  // [ChatGPT-GPT6 / MEL-CODE-DISPATCH-CAS] Claim the dispatch slot *before*
  // touching the relay. The earlier read-only cooldown is insufficient when
  // cron and an authenticated MAX tick race in separate Worker isolates.
  // D1's single-statement upsert is the cross-isolate compare-and-swap.
  const createdAt = job.package_created_at || null;
  const candidateSha = job.candidate_sha || null;
  const latestAt = Number(last?.last_seen || 0);
  if (last && packageAt <= latestAt && now >= latestAt && now - latestAt < REDISPATCH_MS) {
    return { status: 'SKIPPED_RECENTLY_DISPATCHED' };
  }
  const attemptId = crypto.randomUUID();
  const reservation = JSON.stringify({
    job_id: job.id, package_created_at: createdAt, candidate_sha: candidateSha,
    attempt_id: attemptId,
  });
  // New package/SHA may supersede an older reservation without waiting for
  // its cooldown. The WHERE is evaluated atomically by D1, never in JS.
  const reserved = await db.prepare(`INSERT INTO dev_bridge_state(bridge_id,last_seen,status,metadata_json)
      VALUES(?,?,?,?)
      ON CONFLICT(bridge_id) DO UPDATE SET
        last_seen=excluded.last_seen,status=excluded.status,metadata_json=excluded.metadata_json
      WHERE dev_bridge_state.last_seen <= ?
         OR COALESCE(json_extract(CASE WHEN json_valid(dev_bridge_state.metadata_json)
           THEN dev_bridge_state.metadata_json ELSE '{}' END,'$.package_created_at'),'') <> ?
         OR COALESCE(json_extract(CASE WHEN json_valid(dev_bridge_state.metadata_json)
           THEN dev_bridge_state.metadata_json ELSE '{}' END,'$.candidate_sha'),'') <> ?`)
    .bind(key, now, 'DISPATCHING', reservation, now - REDISPATCH_MS,
      String(createdAt || ''), String(candidateSha || '')).run();
  if (Number(reserved?.meta?.changes ?? reserved?.changes ?? 0) !== 1) {
    return { status: 'SKIPPED_RECENTLY_DISPATCHED' };
  }

  let queued;
  try {
    queued = await store.enqueue({ workflow: CLOUD_BRIDGE_WORKFLOW, ref: 'main', inputs: { job_id: String(job.id), chain_depth: '0' }, now });
    if (!queued?.id) throw new Error('CLOUD_RELAY_RECEIPT_MISSING');
  } catch {
    // Do not clobber a newer package's reservation if this attempt expired.
    await db.prepare(`UPDATE dev_bridge_state
      SET last_seen=?,status='CLOUD_UNAVAILABLE',metadata_json=?
      WHERE bridge_id=? AND status='DISPATCHING' AND metadata_json=?`)
      .bind(now, JSON.stringify({ ...JSON.parse(reservation), code: 'CLOUD_RELAY_ENQUEUE_FAILED' }),
        key, reservation).run();
    return { status: 'CLOUD_UNAVAILABLE', code: 'CLOUD_RELAY_ENQUEUE_FAILED', job_id: job.id };
  }
  const recorded = await db.prepare(`UPDATE dev_bridge_state
    SET last_seen=?,status='QUEUED',metadata_json=?
    WHERE bridge_id=? AND status='DISPATCHING' AND metadata_json=?`)
    .bind(now, JSON.stringify({ ...JSON.parse(reservation), relay_job_id: queued.id }),
      key, reservation).run();
  if (Number(recorded?.meta?.changes ?? recorded?.changes ?? 0) !== 1) {
    return { status: 'SKIPPED_STALE_DISPATCH', code: 'DISPATCH_RESERVATION_SUPERSEDED' };
  }
  return { status: 'DISPATCH_QUEUED', relay_job_id: queued.id };
}
