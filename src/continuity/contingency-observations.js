// Tri-state health: a missing, stale or malformed observation is UNKNOWN,
// never UP or DOWN. Observations are reports, not independently authenticated
// attestations. Trusted producers must authenticate at the ingestion boundary.
export const CONTINGENCY_PARTS = Object.freeze(['cloudflare','pc','github','model','gmail','onedrive','shards']);
const FLAG = Object.freeze({cloudflare:'cloudflareUp',pc:'pcUp',github:'githubUp',model:'modelUp',gmail:'gmailUp',onedrive:'onedriveUp',shards:'shardsUp'});

export function observedContingencyFromProbes(reports = [], { now = Date.now(), maxAgeMs = 180_000 } = {}) {
  const state = {};
  const details = {};
  for (const part of CONTINGENCY_PARTS) {
    const valid = (Array.isArray(reports) ? reports : []).filter(row => {
      if (row?.part !== part || (row?.up !== true && row?.up !== false)) return false;
      if (typeof row?.observer !== 'string' || !row.observer.trim()) return false;
      if (typeof row?.evidence_id !== 'string' || !row.evidence_id.trim()) return false;
      const timestamp = Date.parse(String(row?.observed_at || ''));
      return Number.isFinite(timestamp) && timestamp <= now && timestamp >= now - maxAgeMs;
    }).sort((a,b) => Date.parse(b.observed_at) - Date.parse(a.observed_at));
    if (!valid.length) {
      details[part] = Object.freeze({ status:'UNKNOWN', reason:'NO_FRESH_PROBE' });
      continue;
    }
    // Equally recent contradictory reports do not produce a false diagnosis.
    const newest = Date.parse(valid[0].observed_at);
    const top = valid.filter(row => Date.parse(row.observed_at) === newest);
    if (top.some(row => row.up !== top[0].up)) {
      details[part] = Object.freeze({ status:'UNKNOWN', reason:'CONFLICTING_PROBES' });
      continue;
    }
    state[FLAG[part]] = top[0].up;
    details[part] = Object.freeze({ status:top[0].up ? 'UP':'DOWN', evidence_id:top[0].evidence_id, observer:top[0].observer, observed_at:top[0].observed_at });
  }
  return Object.freeze({ observed:Object.freeze(state), details:Object.freeze(details), authenticated:false });
}
