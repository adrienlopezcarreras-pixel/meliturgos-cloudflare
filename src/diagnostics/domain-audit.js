import { hasLeakedToolProtocol, isToolProtocolExampleRequest } from '../api/agent-tools.js';
// Weekly outcome audit of every MEL domain: does the chat answer, does the
// watch still run, does WORK deliver. The capability stress proves that a
// capability responds; this proves that each domain produces results. Every
// finding becomes a repair mission through the self-audit supervisor.

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;
const obj = value => {
  if (value && typeof value === 'object') return value;
  try { return JSON.parse(value || '{}') || {}; } catch { return {}; }
};
const time = value => (typeof value === 'number' ? value : Date.parse(String(value || ''))) || 0;

/** Chat: high-severity quality issues and tool calls leaked to the owner. */
export function auditChat(events = [], { now = Date.now() } = {}) {
  const week = events.filter(row => time(row?.created_at) >= now - WEEK_MS);
  const findings = [];
  const issues = row => { try { const list = JSON.parse(String(row?.issues_json || '[]')); return Array.isArray(list) ? list : []; } catch { return []; } };
  const high = week.filter(row => issues(row).some(issue => issue?.severity === 'high'));
  if (week.length >= 3 && high.length / week.length > 0.2) {
    findings.push({ code: 'CHAT_OFF_TOPIC_ANSWERS', detail: high.length + '/' + week.length + ' réponses hors sujet ou vides cette semaine' });
  }
  const leaks = week.filter(row => !isToolProtocolExampleRequest(row?.user_excerpt || '')
    && hasLeakedToolProtocol(row?.response_excerpt || ''));
  if (leaks.length) findings.push({ code: 'CHAT_RAW_TOOL_CALL_SHOWN', detail: leaks.length + ' réponses affichent un appel d’outil brut au lieu du résultat' });
  return findings;
}

/** Watch: every periodic watch must have run within twice its interval. */
export function auditWatch(states = [], { now = Date.now() } = {}) {
  const findings = [];
  for (const row of states) {
    const state = obj(row?.state_json);
    const last = time(state.last_run_at) || time(row?.updated_at);
    const interval = Number(state.interval_ms) || DAY_MS;
    if (row?.id === 'ecosystem-discoveries-canonical') continue; // written by the ecosystem run itself
    if (last && now - last > 2 * interval) {
      findings.push({ code: 'WATCH_STALLED', detail: row.id + ' sans passage depuis ' + Math.round((now - last) / 3_600_000) + ' h (intervalle ' + Math.round(interval / 3_600_000) + ' h)' });
    }
  }
  return findings;
}

/** WORK: cycles must complete; interruptions must stay the exception. */
export function auditWork(cycles = [], { now = Date.now() } = {}) {
  const week = cycles.filter(row => time(row?.updated_at) >= now - WEEK_MS);
  const findings = [];
  const count = state => week.filter(row => String(row?.state).toUpperCase() === state).length;
  const complete = count('COMPLETE');
  const interrupted = count('INTERRUPTED');
  const failed = count('FAILED');
  if (week.length && complete === 0) findings.push({ code: 'WORK_NO_COMPLETED_CYCLE', detail: week.length + ' cycles, aucun terminé' });
  if (week.length >= 4 && (interrupted + failed) / week.length > 0.3) {
    findings.push({ code: 'WORK_CYCLES_INTERRUPTED', detail: interrupted + ' interrompus et ' + failed + ' en échec sur ' + week.length });
  }
  return findings;
}

/** Core, memory and security (MEL-AUDIT-05): recurring runtime errors,
 * unconsolidated memory, expired sessions still stored, stale backups. */
export function auditCore({ errors = [], memory = {}, sessions = {}, lastBackupAt } = {}, { now = Date.now() } = {}) {
  const findings = [];
  for (const row of errors) {
    if (Number(row?.n) >= 10) findings.push({ code: 'CORE_RECURRING_ERROR', detail: row.n + ' fois cette semaine : ' + String(row.path || '—') + ' ' + String(row.error || row.status || '').slice(0, 120) });
  }
  if (Number(memory.pending_old) > 100) {
    findings.push({ code: 'MEMORY_UNCONSOLIDATED', detail: memory.pending_old + ' souvenirs candidats en attente depuis plus de 7 jours (' + (Number(memory.pending) || 0) + ' en attente au total)' });
  }
  if (Number(sessions.expired) > 0) findings.push({ code: 'SECURITY_EXPIRED_SESSIONS_KEPT', detail: sessions.expired + ' sessions web expirées encore stockées' });
  const backup = time(lastBackupAt);
  if (lastBackupAt === undefined) return findings;
  if (!backup || now - backup > 3 * DAY_MS) {
    findings.push({ code: 'BACKUP_STALE', detail: backup ? 'dernière sauvegarde il y a ' + Math.round((now - backup) / 3_600_000) + ' h' : 'aucune sauvegarde enregistrée' });
  }
  return findings;
}

export async function runDomainAudit(db, { now = Date.now() } = {}) {
  const rows = async sql => (await db.prepare(sql).all().catch(() => ({ results: [] })))?.results || [];
  // A missing table means "not measured", never a finding.
  const one = async (sql, ...binds) => { try { return await db.prepare(sql).bind(...binds).first(); } catch { return null; } };
  const weekAgo = now - WEEK_MS;
  const [events, states, cycles, errors, memory, sessions, backup] = await Promise.all([
    rows('SELECT user_excerpt, issues_json, response_excerpt, created_at FROM mel_response_quality_events ORDER BY created_at DESC LIMIT 500'),
    rows('SELECT id, state_json, updated_at FROM capability_watch_state'),
    rows('SELECT state, updated_at FROM mel_work_cycles ORDER BY updated_at DESC LIMIT 500'),
    (async () => { try { return (await db.prepare(`SELECT path, response_status AS status, substr(coalesce(error_message, ''), 1, 120) AS error, count(*) AS n FROM audit_logs
      WHERE timestamp > ? AND (response_status >= 500 OR error_message IS NOT NULL) GROUP BY 1, 2, 3 ORDER BY n DESC LIMIT 20`).bind(weekAgo).all())?.results || []; } catch { return []; } })(),
    one("SELECT count(*) AS pending, sum(CASE WHEN created_at < ? THEN 1 ELSE 0 END) AS pending_old FROM memory_candidates WHERE status = 'PENDING'", weekAgo),
    one('SELECT count(*) AS expired FROM web_sessions WHERE expires_at < ?', now),
    one('SELECT max(created_at) AS last FROM backup_objects'),
  ]);
  const findings = [...auditChat(events, { now }), ...auditWatch(states, { now }), ...auditWork(cycles, { now }),
    ...auditCore({ errors, memory: memory || {}, sessions: sessions || {}, lastBackupAt: backup ? backup.last : undefined }, { now })];
  return { ok: findings.length === 0, status: findings.length ? 'DOMAIN_AUDIT_FAILED' : 'DOMAIN_AUDIT_OK', findings };
}
