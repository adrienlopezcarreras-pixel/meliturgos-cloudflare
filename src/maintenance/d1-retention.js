// Weekly D1 retention (owner rule, 25/10: lighten MEL once a local D1 backup is
// proven). Only data whose fate is known is touched:
// - FAILED/CANCELLED dev jobs older than 7 days keep their row, status and
//   error, but drop their heavy plan/patch/result JSON (Teacher histories
//   reached 500 KB per job);
// - audit_logs rows older than 30 days are deleted;
// - finished computer commands older than 14 days drop their result payload.
// COMPLETED/DONE_VERIFIED work, memories, conversations and media are never read
// or written here.

const DAY = 86_400_000;
const BATCH = 500;

async function count(db, sql, ...binds) {
  const row = await db.prepare(sql).bind(...binds).first();
  return Number(row?.n || 0);
}

export async function runD1Retention(db, { now = Date.now(), dryRun = false } = {}) {
  if (!db?.prepare) return { ok: false, status: 'SKIPPED_NO_DB' };
  const jobsBefore = now - 7 * DAY;
  const auditBefore = now - 30 * DAY;
  const commandsBefore = now - 14 * DAY;
  const jobsWhere = "status IN ('FAILED','CANCELLED') AND updated_at < ? AND (length(coalesce(result_json,'')) > 2000 OR plan_json IS NOT NULL OR patch_json IS NOT NULL)";
  const commandsWhere = "status IN ('COMPLETED','FAILED','EXPIRED','CANCELLED') AND created_at < ? AND result_json IS NOT NULL AND length(result_json) > 512";
  const plan = {
    jobs: await count(db, `SELECT count(*) n FROM dev_jobs WHERE ${jobsWhere}`, jobsBefore),
    audit_logs: await count(db, 'SELECT count(*) n FROM audit_logs WHERE timestamp < ?', auditBefore),
    computer_commands: await count(db, `SELECT count(*) n FROM computer_commands WHERE ${commandsWhere}`, commandsBefore),
  };
  if (dryRun) return { ok: true, status: 'RETENTION_DRY_RUN', plan };
  const compacted = JSON.stringify({ compacted: true, compacted_at: new Date(now).toISOString(), reason: 'WEEKLY_D1_RETENTION' });
  // Bounded batches keep each statement within D1 limits.
  const jobs = await db.prepare(`UPDATE dev_jobs SET result_json = json_set(?, '$.error', error), plan_json = NULL, patch_json = NULL
    WHERE rowid IN (SELECT rowid FROM dev_jobs WHERE ${jobsWhere} LIMIT ${BATCH})`).bind(compacted, jobsBefore).run();
  const audit = await db.prepare(`DELETE FROM audit_logs WHERE rowid IN (SELECT rowid FROM audit_logs WHERE timestamp < ? LIMIT ${BATCH * 10})`).bind(auditBefore).run();
  const commands = await db.prepare(`UPDATE computer_commands SET result_json = ?
    WHERE rowid IN (SELECT rowid FROM computer_commands WHERE ${commandsWhere} LIMIT ${BATCH})`).bind(compacted, commandsBefore).run();
  return {
    ok: true,
    status: 'RETENTION_APPLIED',
    plan,
    changed: {
      jobs: Number(jobs?.meta?.changes || 0),
      audit_logs: Number(audit?.meta?.changes || 0),
      computer_commands: Number(commands?.meta?.changes || 0),
    },
  };
}
