// MEL WORK on its own, end to end: every 6 hours the hourly maintenance cron
// runs one autonomous cycle (bounty offers only, no human step). MEL writes the
// deliverable and hands it in herself through the owner's PC (Companion). A
// deliverable that could not be handed in yet (PC off, daily limit) is retried
// every hour, and every resolved contract MEL lost is turned into a lesson. Nothing here can move funds; rewards land in MEL's wallet.

import { streamDirectWork } from './work-stream.js';
import { queueTaskmarketSubmission, refreshTaskmarketSubmissions } from './taskmarket-autosubmit.js';
import { reviewSubmissionOutcomes } from './work-lessons.js';
import { ensureTaskmarketWalletImport } from './taskmarket-cloud.js';

export const MEL_WORK_SCHEDULE_HOURS = Object.freeze([0, 6, 12, 18]);
export const MEL_WORK_MAX_DAILY_DRAFTS = 4;
const RETRYABLE = new Set(['COMPANION_OFFLINE', 'DAILY_LIMIT_REACHED', 'QUEUE_FAILED', 'LEGAL_ACCEPTANCE_REQUIRED', 'CLOUD_SUBMIT_FAILED']);

async function draftsLast24h(db, now) {
  try {
    const row = await db.prepare('SELECT COUNT(*) AS n FROM mel_work_artifacts WHERE created_at > ?').bind(new Date(now.getTime() - 86_400_000).toISOString()).first();
    return Number(row?.n || 0);
  } catch { return 0; } // table not created yet
}

// Deliverables finished while the PC was off (or over the daily limit) are handed in later.
export async function retryPendingSubmissions(env, { now = Date.now(), queue = queueTaskmarketSubmission } = {}) {
  const db = env.DB;
  let rows = [];
  try {
    rows = (await db.prepare("SELECT id, result FROM mel_work_cycles WHERE state='COMPLETE' AND updated_at > ? ORDER BY updated_at DESC LIMIT 10").bind(new Date(now - 3 * 86_400_000).toISOString()).all())?.results || [];
  } catch { return { retried: 0 }; }
  let retried = 0;
  for (const row of rows) {
    let result = null;
    try { result = JSON.parse(row.result || '{}'); } catch { continue; }
    if (!RETRYABLE.has(result?.submission) || !result.artifactId) continue;
    const queued = await queue(env, { artifactId: result.artifactId, taskId: result.missionId, mode: result.mode, status: result.status, now }).catch(e => ({ status: 'QUEUE_FAILED', code: String(e?.message || '') }));
    if (queued?.status === result.submission) continue;
    result.submission = queued?.status || 'QUEUE_FAILED';
    await db.prepare('UPDATE mel_work_cycles SET result=?, updated_at=? WHERE id=?').bind(JSON.stringify(result), new Date(now).toISOString(), row.id).run();
    retried += 1;
    if (['COMPANION_OFFLINE', 'DAILY_LIMIT_REACHED', 'LEGAL_ACCEPTANCE_REQUIRED'].includes(result.submission)) break;
  }
  return { retried };
}

export async function runScheduledMelWork(env, { now = new Date(), run = streamDirectWork, startCycle = true } = {}) {
  if (String(env?.MEL_WORK_AUTONOMOUS || 'on').toLowerCase() === 'off') return { status: 'DISABLED' };
  if (!env?.DB?.prepare || typeof env?.AI?.run !== 'function') return { status: 'RUNTIME_UNAVAILABLE' };
  // Once: copy the PC Taskmarket keystore to the vault so hand-ins work PC off.
  await ensureTaskmarketWalletImport(env, { now: now.getTime() }).catch(() => null);
  await refreshTaskmarketSubmissions(env, { now: now.getTime() }).catch(() => null);
  await retryPendingSubmissions(env, { now: now.getTime() }).catch(() => null);
  // A cycle still RUNNING after 30 min was cut (deploy, limit): say so.
  await env.DB.prepare("UPDATE mel_work_cycles SET state='INTERRUPTED', result=?, updated_at=? WHERE state='RUNNING' AND updated_at < ?")
    .bind(JSON.stringify({ status: 'INTERRUPTED' }), now.toISOString(), new Date(now.getTime() - 30 * 60_000).toISOString()).run().catch(() => null);
  // Won or lost? Each lost contract becomes a lesson for the next cycles.
  await reviewSubmissionOutcomes(env, { now: now.getTime() }).catch(() => null);
  // The hourly batch only does housekeeping: a cycle started there shared the
  // invocation with ~15 tasks and was cut (14 INTERRUPTED for 5 COMPLETE).
  if (!startCycle) return { status: 'HOUSEKEEPING_ONLY' };
  if (!MEL_WORK_SCHEDULE_HOURS.includes(now.getUTCHours())) return { status: 'NOT_SCHEDULED_HOUR' };
  const drafts = await draftsLast24h(env.DB, now);
  if (drafts >= MEL_WORK_MAX_DAILY_DRAFTS) return { status: 'DAILY_DRAFT_LIMIT', drafts };
  const text = await (await run({ env, autonomous: true })).text();
  const events = text.split('\n').filter(Boolean).map(line => { try { return JSON.parse(line); } catch { return null; } }).filter(Boolean);
  const done = events.find(e => e.type === 'done');
  const error = events.find(e => e.type === 'error');
  if (!done) return { status: 'FAILED', code: error?.code || 'NO_RESULT' };
  const r = done.result || {};
  return { status: r.status || 'DONE', artifactId: r.artifactId || null, missionId: r.missionId || null, submission: r.submission || null };
}

/** A WORK cycle gets its own per-minute invocation, at minute 29 of each scheduled hour. */
export function isDedicatedWorkMinute(date) {
  return date.getUTCMinutes() === 29 && MEL_WORK_SCHEDULE_HOURS.includes(date.getUTCHours());
}
