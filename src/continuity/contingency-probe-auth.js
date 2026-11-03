// Authenticated probe envelope. The shared secret belongs in a server-side
// secret binding, never in client-visible data or a source-controlled file.
import { observedContingencyFromProbes } from './contingency-observations.js';

function message(report) {
  return ['mel.contingency-probe/v1', report.part, report.up === true ? 'UP' : 'DOWN',
    report.observer, report.evidence_id, report.observed_at].join('\\n');
}
function hex(bytes) {
  return [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('');
}
function equalHex(left, right) {
  if (typeof right !== 'string' || !/^[0-9a-f]{64}$/i.test(right)) return false;
  const a = String(left).toLowerCase(), b = right.toLowerCase();
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}
export async function verifyContingencyProbeReports(reports = [], { secret, now = Date.now(), maxAgeMs = 180_000, cryptoImpl = globalThis.crypto } = {}) {
  const input = Array.isArray(reports) ? reports.slice(0, 100) : [];
  if (typeof secret !== 'string' || secret.length < 32 || !cryptoImpl?.subtle) {
    return Object.freeze({ ...observedContingencyFromProbes([], { now, maxAgeMs }), verified_count: 0, reason: 'PROBE_SECRET_UNAVAILABLE' });
  }
  const key = await cryptoImpl.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const verified = [];
  for (const report of input) {
    if (!report || typeof report !== 'object' || typeof report.part !== 'string' ||
      typeof report.observer !== 'string' || typeof report.evidence_id !== 'string' ||
      typeof report.observed_at !== 'string' || (report.up !== true && report.up !== false)) continue;
    const time = Date.parse(report.observed_at);
    if (!Number.isFinite(time) || time > now || time < now - maxAgeMs) continue;
    const expected = hex(new Uint8Array(await cryptoImpl.subtle.sign('HMAC', key, new TextEncoder().encode(message(report)))));
    if (equalHex(expected, report.signature)) verified.push(report);
  }
  const result = observedContingencyFromProbes(verified, { now, maxAgeMs });
  return Object.freeze({ ...result, authenticated: true, verified_count: verified.length, reason: verified.length ? 'VERIFIED_REPORTS' : 'NO_VERIFIED_REPORTS' });
}

/** Sign external measurements in the *independent* monitor, using a secret
 * stored only in the monitor and receiving Worker's secret stores. */
export async function signContingencyProbeReport(report, { secret, cryptoImpl = globalThis.crypto } = {}) {
  if (typeof secret !== 'string' || secret.length < 32 || !cryptoImpl?.subtle
      || !['cloudflare','pc','github','model','gmail','onedrive','shards'].includes(report?.part)
      || (report?.up !== true && report?.up !== false)
      || typeof report?.observer !== 'string' || !report.observer.trim()
      || typeof report?.evidence_id !== 'string' || !report.evidence_id.trim()
      || !Number.isFinite(Date.parse(String(report?.observed_at || '')))) {
    throw Object.assign(new Error('PROBE_SIGNING_CONFIG_INVALID'), { code: 'PROBE_SIGNING_CONFIG_INVALID' });
  }
  const key = await cryptoImpl.subtle.importKey(
    'raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const signature = hex(new Uint8Array(await cryptoImpl.subtle.sign(
    'HMAC', key, new TextEncoder().encode(message(report)),
  )));
  return Object.freeze({
    part: report.part, up: report.up, observer: report.observer,
    evidence_id: report.evidence_id, observed_at: report.observed_at, signature,
  });
}
