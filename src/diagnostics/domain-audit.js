import { architectureFindings, readArchitectureReport } from './architecture-audit-store.js';
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
const time = value => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const text = String(value ?? '').trim();
  const parsed = /^-?\d+(?:\.\d+)?$/.test(text) ? Number(text) : Date.parse(text);
  return Number.isFinite(parsed) ? parsed : 0;
};

// Durable row references only: never include conversations or WORK payloads.
const withDomainEvidence = (finding, table, rows) => {
  const refs = [...new Map(rows.filter(row => /^[A-Za-z0-9_.:-]{1,160}$/.test(String(row?.id || '')))
    .map(row => [String(row.id), {table, id:String(row.id), at:time(row.created_at ?? row.updated_at) || null}])).values()];
  return refs.length ? {...finding, evidence_refs:refs.slice(0,20), evidence_refs_omitted:Math.max(0,refs.length-20)} : finding;
};

/** Chat: high-severity quality issues and tool calls leaked to the owner. */
export function auditChat(events = [], { now = Date.now() } = {}) {
  const week = events.filter(row => time(row?.created_at) >= now - WEEK_MS);
  const findings = [];
  const issues = row => { try { const list = JSON.parse(String(row?.issues_json || '[]')); return Array.isArray(list) ? list : []; } catch { return []; } };
  const high = week.filter(row => issues(row).some(issue => issue?.severity === 'high'));
  if (week.length >= 3 && high.length / week.length > 0.2) {
    findings.push(withDomainEvidence({ code: 'CHAT_OFF_TOPIC_ANSWERS', detail: high.length + '/' + week.length + ' réponses hors sujet ou vides cette semaine' }, 'mel_response_quality_events', high));
  }
  const leaks = week.filter(row => !isToolProtocolExampleRequest(row?.user_excerpt || '')
    && hasLeakedToolProtocol(row?.response_excerpt || ''));
  if (leaks.length) findings.push(withDomainEvidence({ code: 'CHAT_RAW_TOOL_CALL_SHOWN', detail: leaks.length + ' réponses affichent un appel d’outil brut au lieu du résultat' }, 'mel_response_quality_events', leaks));
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
      findings.push(withDomainEvidence({ code: 'WATCH_STALLED', detail: row.id + ' sans passage depuis ' + Math.round((now - last) / 3_600_000) + ' h (intervalle ' + Math.round(interval / 3_600_000) + ' h)' }, 'capability_watch_state', [row]));
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
  if (week.length && complete === 0) findings.push(withDomainEvidence({ code: 'WORK_NO_COMPLETED_CYCLE', detail: week.length + ' cycles, aucun terminé' }, 'mel_work_cycles', week));
  if (week.length >= 4 && (interrupted + failed) / week.length > 0.3) {
    findings.push(withDomainEvidence({ code: 'WORK_CYCLES_INTERRUPTED', detail: interrupted + ' interrompus et ' + failed + ' en échec sur ' + week.length }, 'mel_work_cycles', week.filter(row => ['INTERRUPTED','FAILED'].includes(String(row?.state).toUpperCase()))));
  }
  return findings;
}

/** Core, memory and security (MEL-AUDIT-05): recurring runtime errors,
 * unconsolidated memory, expired sessions still stored, stale backups. */
export function auditCore({ errors = [], memory = {}, sessions = {}, lastBackupAt } = {}, { now = Date.now() } = {}) {
  const findings = [];
  // MEL-AUDIT-05: raw rows are measured against the injected clock, so a test
  // (or a replay) decides exactly what is old or expired, never the wall clock.
  if (Array.isArray(memory.candidates)) {
    const pending = memory.candidates.filter(row => String(row?.status || 'PENDING').toUpperCase() === 'PENDING');
    memory = { pending: pending.length, pending_old: pending.filter(row => time(row?.created_at) < now - WEEK_MS).length };
  }
  if (Array.isArray(sessions.rows)) sessions = { expired: sessions.rows.filter(row => time(row?.expires_at) < now).length };
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
  const [events, states, cycles, errors, memory, sessions, backup, architecture] = await Promise.all([
    rows('SELECT id, user_excerpt, issues_json, response_excerpt, created_at FROM mel_response_quality_events ORDER BY created_at DESC LIMIT 500'),
    rows('SELECT id, state_json, updated_at FROM capability_watch_state'),
    rows('SELECT id, state, updated_at FROM mel_work_cycles ORDER BY updated_at DESC LIMIT 500'),
    (async () => { try { return (await db.prepare(`SELECT path, response_status AS status, substr(coalesce(error_message, ''), 1, 120) AS error, count(*) AS n FROM audit_logs
      WHERE timestamp > ? AND (response_status >= 500 OR error_message IS NOT NULL) GROUP BY 1, 2, 3 ORDER BY n DESC LIMIT 20`).bind(weekAgo).all())?.results || []; } catch { return []; } })(),
    one("SELECT count(*) AS pending, sum(CASE WHEN created_at < ? THEN 1 ELSE 0 END) AS pending_old FROM memory_candidates WHERE status = 'PENDING'", weekAgo),
    one('SELECT count(*) AS expired FROM web_sessions WHERE expires_at < ?', now),
    one('SELECT max(created_at) AS last FROM backup_objects'),
    readArchitectureReport(db),
  ]);
  const findings = [...auditChat(events, { now }), ...auditWatch(states, { now }), ...auditWork(cycles, { now }),
    ...auditCore({ errors, memory: memory || {}, sessions: sessions || {}, lastBackupAt: backup ? backup.last : undefined }, { now }),
    ...architectureFindings(architecture, { now })];
  return { ok: findings.length === 0, status: findings.length ? 'DOMAIN_AUDIT_FAILED' : 'DOMAIN_AUDIT_OK', findings };
}
