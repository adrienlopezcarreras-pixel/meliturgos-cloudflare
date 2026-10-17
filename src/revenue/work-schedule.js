// MEL WORK on its own: every 6 hours the hourly maintenance cron runs one draft
// cycle (same engine and safety gates as the owner's button). It never claims,
// submits or pays, and pauses while 3 drafts already wait for the owner's review.

import { streamDirectWork } from './work-stream.js';

export const MEL_WORK_SCHEDULE_HOURS = Object.freeze([0, 6, 12, 18]);
export const MEL_WORK_MAX_PENDING_DRAFTS = 3;

async function pendingDrafts(db) {
  try {
    const row = await db.prepare("SELECT COUNT(*) AS n FROM mel_work_artifacts WHERE status IN ('DRAFT_UNVERIFIED','VERIFIED_LOCALLY')").first();
    return Number(row?.n || 0);
  } catch { return 0; } // table not created yet: nothing pending
}

export async function runScheduledMelWork(env, { now = new Date(), run = streamDirectWork } = {}) {
  if (String(env?.MEL_WORK_AUTONOMOUS || 'on').toLowerCase() === 'off') return { status: 'DISABLED' };
  if (!env?.DB?.prepare || typeof env?.AI?.run !== 'function') return { status: 'RUNTIME_UNAVAILABLE' };
  if (!MEL_WORK_SCHEDULE_HOURS.includes(now.getUTCHours())) return { status: 'NOT_SCHEDULED_HOUR' };
  const pending = await pendingDrafts(env.DB);
  if (pending >= MEL_WORK_MAX_PENDING_DRAFTS) return { status: 'WAITING_FOR_OWNER_REVIEW', pending };
  const text = await (await run({ env })).text();
  const events = text.split('\n').filter(Boolean).map(line => { try { return JSON.parse(line); } catch { return null; } }).filter(Boolean);
  const done = events.find(e => e.type === 'done');
  const error = events.find(e => e.type === 'error');
  return done ? { status: done.result?.status || 'DONE', artifactId: done.result?.artifactId || null, missionId: done.result?.missionId || null }
    : { status: 'FAILED', code: error?.code || 'NO_RESULT' };
}
