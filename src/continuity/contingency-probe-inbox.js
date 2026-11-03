// HMAC-authenticated monitor inbox. Only facts, never permission to fail over.
import { verifyContingencyProbeReports } from './contingency-probe-auth.js';
import { CONTINGENCY_PARTS } from './contingency-observations.js';

const PREFIX = 'mel:contingency-probe:';
const MAX_BODY = 4096;
const NO_STORE = { 'cache-control': 'no-store' };

function reply(body, status) {
  return Response.json(body, { status, headers: NO_STORE });
}

export async function acceptContingencyProbe(request, env = {}, { now = Date.now(), cryptoImpl = globalThis.crypto } = {}) {
  if (request?.method !== 'POST') return reply({ ok: false, code: 'METHOD_NOT_ALLOWED' }, 405);
  if (!env?.DB?.prepare || typeof env?.MEL_CONTINGENCY_PROBE_HMAC_KEY !== 'string'
      || env.MEL_CONTINGENCY_PROBE_HMAC_KEY.length < 32) {
    return reply({ ok: false, code: 'PROBE_INBOX_NOT_CONFIGURED' }, 503);
  }
  if (Number(request.headers.get('content-length') || 0) > MAX_BODY) {
    return reply({ ok: false, code: 'PROBE_BODY_TOO_LARGE' }, 413);
  }
  let report;
  try {
    const raw = await request.text();
    if (raw.length > MAX_BODY) return reply({ ok: false, code: 'PROBE_BODY_TOO_LARGE' }, 413);
    report = JSON.parse(raw);
  } catch {
    return reply({ ok: false, code: 'PROBE_BODY_INVALID' }, 400);
  }
  if (!report || typeof report !== 'object' || Array.isArray(report)
      || !CONTINGENCY_PARTS.includes(report.part)
      || typeof report.observer !== 'string' || !report.observer.trim() || report.observer.length > 100
      || typeof report.evidence_id !== 'string' || !report.evidence_id.trim() || report.evidence_id.length > 160
      || typeof report.observed_at !== 'string' || report.observed_at.length > 40
      || (report.up !== true && report.up !== false)
      || typeof report.signature !== 'string' || !/^[0-9a-f]{64}$/i.test(report.signature)) {
    return reply({ ok: false, code: 'PROBE_BODY_INVALID' }, 400);
  }
  const checked = await verifyContingencyProbeReports([report], {
    secret: env.MEL_CONTINGENCY_PROBE_HMAC_KEY, now, cryptoImpl,
  });
  if (checked.verified_count !== 1) return reply({ ok: false, code: 'PROBE_SIGNATURE_OR_FRESHNESS_INVALID' }, 401);

  const sample = {
    part: report.part, up: report.up, observer: report.observer,
    evidence_id: report.evidence_id, observed_at: report.observed_at,
    signature: report.signature.toLowerCase(),
  };
  const observedAt = Date.parse(sample.observed_at);
  try {
    // Ignore replay or old observations atomically. Only one bounded latest
    // report per part is kept; a dead monitor cannot extend proof freshness.
    const write = await env.DB.prepare(`INSERT INTO dev_bridge_state
      (bridge_id,last_seen,status,metadata_json) VALUES (?,?,?,?)
      ON CONFLICT(bridge_id) DO UPDATE SET
        last_seen=excluded.last_seen,status=excluded.status,metadata_json=excluded.metadata_json
      WHERE dev_bridge_state.last_seen < excluded.last_seen`)
      .bind(PREFIX + sample.part, observedAt, 'SIGNED_PROBE', JSON.stringify(sample)).run();
    if (Number(write?.meta?.changes ?? write?.changes ?? 0) !== 1) {
      return reply({ ok: false, code: 'PROBE_REPLAY_OR_OLDER' }, 409);
    }
  } catch {
    return reply({ ok: false, code: 'PROBE_INBOX_STORAGE_FAILED' }, 503);
  }
  return reply({ ok: true, status: 'SIGNED_PROBE_PERSISTED', part: sample.part, observed_at: sample.observed_at,
    failover_performed: false }, 202);
}

export async function readContingencyProbeInbox(db) {
  if (!db?.prepare) return [];
  const keys = CONTINGENCY_PARTS.map(part => PREFIX + part);
  const placeholders = keys.map(() => '?').join(',');
  const read = await db.prepare(`SELECT bridge_id,metadata_json FROM dev_bridge_state
    WHERE bridge_id IN (${placeholders})`).bind(...keys).all();
  const reports = [];
  for (const row of read?.results || []) {
    try {
      const report = JSON.parse(row?.metadata_json || '');
      if (row.bridge_id === PREFIX + report?.part && CONTINGENCY_PARTS.includes(report.part)) {
        reports.push(report);
      }
    } catch { /* corrupt data is not evidence */ }
  }
  return reports;
}
