// MEL-AUDIT-04: the weekly architecture audit runs in GitHub Actions
// (scripts/architecture-audit.mjs reads the whole repository, too heavy for a
// Worker) and posts its report here with a GitHub OIDC identity. The weekly
// domain audit turns the latest report into findings.
import { authorizeGitHubActionsOidcRequest } from '../security/github-actions-oidc.js';

const WORKFLOW = 'architecture-audit.yml';
const KEY = 'latest';
const DAY_MS = 86_400_000;

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8' } });

async function ensureSchema(db) {
  await db.prepare('CREATE TABLE IF NOT EXISTS mel_architecture_audit (id TEXT PRIMARY KEY, report_json TEXT NOT NULL, source_sha TEXT, received_at INTEGER NOT NULL)').run();
}

const list = (value, max) => (Array.isArray(value) ? value.slice(0, max) : []);

export async function storeArchitectureReport(db, report, { sha = '', now = Date.now() } = {}) {
  if (report?.schema !== 'mel.architecture-audit/v1') throw Object.assign(new Error('ARCHITECTURE_REPORT_SCHEMA_INVALID'), { status: 400 });
  // Bounded copy: a report never grows D1 beyond a few kilobytes.
  const bounded = {
    schema: report.schema,
    source_files: Number(report.source_files) || 0,
    max_lines: Number(report.max_lines) || 1500,
    oversized: list(report.oversized, 20),
    untested_modules: list(report.untested_modules, 200),
    legacy_imported: list(report.legacy_imported, 50),
    duplicate_exports: list(report.duplicate_exports, 50),
    ...(Array.isArray(report.new_models) ? { new_models: list(report.new_models, 30).map(String) } : {}),
    ...(report.ui?.schema === 'mel.ui-production-audit/v1' ? { ui: {
      schema: report.ui.schema,
      pages: Number(report.ui.pages) || 0,
      api_calls: Number(report.ui.api_calls) || 0,
      blocked_calls: Number(report.ui.blocked_calls) || 0,
      findings: list(report.ui.findings, 40).map(row => ({ code: String(row?.code || '').slice(0, 60), detail: String(row?.detail || '').slice(0, 300) })),
    } } : {}),
  };
  await ensureSchema(db);
  await db.prepare(`INSERT INTO mel_architecture_audit (id, report_json, source_sha, received_at) VALUES (?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET report_json = excluded.report_json, source_sha = excluded.source_sha, received_at = excluded.received_at`)
    .bind(KEY, JSON.stringify(bounded), String(sha).slice(0, 40), now).run();
  return { ok: true, status: 'ARCHITECTURE_REPORT_STORED' };
}

export async function readArchitectureReport(db) {
  try {
    const row = await db.prepare('SELECT report_json, source_sha, received_at FROM mel_architecture_audit WHERE id = ?').bind(KEY).first();
    return row ? { report: JSON.parse(row.report_json), source_sha: row.source_sha, received_at: Number(row.received_at) } : null;
  } catch { return null; }
}

/** Findings from the latest report; a report older than 8 days is itself a finding. */
export function architectureFindings(latest, { now = Date.now() } = {}) {
  if (!latest) return [];
  const findings = [];
  if (now - latest.received_at > 8 * DAY_MS) {
    findings.push({ code: 'ARCHITECTURE_AUDIT_STALE', detail: 'dernier rapport d’architecture il y a ' + Math.round((now - latest.received_at) / DAY_MS) + ' jours' });
    return findings;
  }
  const r = latest.report || {};
  for (const row of r.oversized || []) findings.push({ code: 'ARCH_FILE_TOO_LARGE', detail: row.path + ' : ' + row.lines + ' lignes (max ' + r.max_lines + ')' });
  for (const row of r.legacy_imported || []) findings.push({ code: 'ARCH_LEGACY_STILL_IMPORTED', detail: row.path + ' importé par ' + row.imported_by });
  for (const row of r.duplicate_exports || []) findings.push({ code: 'ARCH_DUPLICATE_EXPORT', detail: row.name + ' exporté par ' + (row.files || []).join(', ') });
  // MEL-AUDIT-06: each free model MEL does not use yet is a discovery to
  // measure through the MAX chain before any registry change.
  for (const model of (r.new_models || []).slice(0, 10)) findings.push({ code: 'UPGRADE_MODEL_AVAILABLE', detail: model + ' disponible sur Workers AI, absent de ModelRegistry : à mesurer (sonde code, coût) avant adoption' });
  // MEL-UI-AUDIT: what the owner would see broken on the real pages.
  for (const row of (r.ui?.findings || []).filter(row => /^UI_/.test(row.code))) findings.push(row);
  const untested = r.untested_modules || [];
  if (untested.length) findings.push({ code: 'ARCH_UNTESTED_MODULES', detail: untested.length + ' modules src/ sans test qui les importe, dont ' + untested.slice(0, 5).join(', ') });
  return findings;
}

export async function maybeHandleArchitectureAuditInternal(request, env = {}) {
  const url = new URL(request.url);
  if (url.pathname !== '/api/internal/architecture-audit') return null;
  if (request.method !== 'POST') return json({ ok: false, code: 'METHOD_NOT_ALLOWED' }, 405);
  const auth = await authorizeGitHubActionsOidcRequest(request, env, {
    allowedWorkflows: [WORKFLOW],
    allowedWorkflowBranches: ['main'],
    allowedEvents: ['schedule', 'workflow_dispatch'],
  });
  if (!auth.ok) return json({ ok: false, code: auth.code }, auth.status || 401);
  const body = await request.json().catch(() => null);
  try {
    return json(await storeArchitectureReport(env.DB, body, { sha: auth.identity?.sha }));
  } catch (error) {
    return json({ ok: false, code: String(error?.message || 'ARCHITECTURE_REPORT_FAILED') }, Number(error?.status) || 503);
  }
}
