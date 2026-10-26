// MEL-AUDIT-07: before/after measure of outcome-audit repairs. A finding a
// repair mission targeted must be gone from a later audit; if it is still
// there after the repair had a week, the mission is reopened with the proof
// of failure. After MAX_ATTEMPTS ineffective repairs the finding is escalated
// instead of looping forever.

const DAY_MS = 86_400_000;
export const REPAIR_GRACE_MS = 6 * DAY_MS;
export const MAX_ATTEMPTS = 3;
const MAX_RESOLVED = 50;

/**
 * @param ledger    { [code]: { repaired_at, attempts } } from the last run
 * @param findings  current outcome-audit findings ({ code, detail })
 * @param measured  true when the outcome audits actually ran this pass
 */
export function measureOutcomeRepairs(ledger = {}, findings = [], { measured = false, now = Date.now() } = {}) {
  const present = new Set(findings.map(row => String(row?.code || '')));
  const next = {};
  const resolved = [];
  const persisting = [];
  const escalated = [];
  for (const [code, entry] of Object.entries(ledger || {})) {
    if (measured && !present.has(code)) {
      resolved.push({ code, attempts: entry.attempts, repaired_at: entry.repaired_at, resolved_at: now });
      continue;
    }
    next[code] = entry;
    if (!present.has(code) || now - Number(entry.repaired_at || 0) < REPAIR_GRACE_MS) continue;
    if (Number(entry.attempts || 0) >= MAX_ATTEMPTS) escalated.push({ code, attempts: entry.attempts });
    else persisting.push({ code, attempts: entry.attempts });
  }
  return { ledger: next, resolved, persisting, escalated };
}

/** Findings sent to the repair mission, with the proof of a failed earlier repair. */
export function findingsForRepair(findings = [], { persisting = [], escalated = [] } = {}) {
  const failedBefore = new Map(persisting.map(row => [row.code, row.attempts]));
  const blocked = new Set(escalated.map(row => row.code));
  return findings
    .filter(row => !blocked.has(row.code))
    .map(row => (failedBefore.has(row.code)
      ? { ...row, reopened: true, detail: `${row.detail} — toujours présent après ${failedBefore.get(row.code)} réparation(s) : la correction précédente n’a pas suffi` }
      : row));
}

/** Records the codes a queued repair mission targets. */
export function recordRepairs(ledger = {}, findings = [], { now = Date.now() } = {}) {
  const next = { ...ledger };
  for (const row of findings) {
    const code = String(row?.code || '');
    if (!code) continue;
    const previous = next[code];
    // Only a new attempt counts: a finding still inside its grace week keeps its date.
    if (previous && now - Number(previous.repaired_at || 0) < REPAIR_GRACE_MS) continue;
    next[code] = { repaired_at: now, attempts: Number(previous?.attempts || 0) + 1 };
  }
  return next;
}

export function appendResolved(history = [], resolved = []) {
  return [...(Array.isArray(history) ? history : []), ...resolved].slice(-MAX_RESOLVED);
}
