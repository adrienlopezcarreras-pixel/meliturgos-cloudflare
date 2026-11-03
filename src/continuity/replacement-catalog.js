// Candidates are discovery-only. This catalog never grants deployment approval.
export const REPLACEMENT_CATALOG = Object.freeze({
  cloudflare: { candidates: ['vercel-functions', 'netlify-functions', 'self-hosted-node'], probes: ['http_smoke', 'database_restore', 'scheduled_tick', 'secret_rebind', 'signed_release'] },
  github: { candidates: ['gitlab-mirror', 'codeberg-push-mirror', 'offline-git-bundle'], probes: ['fresh_commit_mirror', 'branch_integrity', 'alternate_ci', 'write_access'] },
  pc: { candidates: ['cloudflare-primary', 'independent-server'], probes: ['remote_heartbeat', 'local_git', 'local_database', 'local_model'] },
  model: { candidates: ['alternate-proven-provider', 'isolated-local-model'], probes: ['authenticated_inference', 'quality_benchmark', 'latency', 'privacy_policy'] },
  gmail: { candidates: ['onedrive-private-kit', 'offline-encrypted-copy'], probes: ['authenticated_read', 'archive_digest', 'decryption', 'restore_drill'] },
  onedrive: { candidates: ['gmail-private-kit', 'offline-encrypted-copy'], probes: ['authenticated_read', 'archive_digest', 'decryption', 'restore_drill'] },
  shards: { candidates: ['ipfs-encrypted-pins', 'storj-encrypted-objects', 'offline-shard-index'], probes: ['retrieve_required_fragments', 'digest_check', 'restore_drill', 'no_public_key'] },
});
export function replacementReadiness(part, evidence = {}) {
  const name = String(part || '').toLowerCase();
  const entry = REPLACEMENT_CATALOG[name];
  if (!entry) return Object.freeze({ part: name, status: 'UNKNOWN_PART', ready: false, automatic_activation: false });
  const checks = Object.freeze(Object.fromEntries(entry.probes.map(probe => [probe, evidence?.[probe] === true])));
  // Legacy boolean reports cannot establish readiness: a task can write true.
  // Keep the field for diagnostics, never promote these unauthenticated claims.
  return Object.freeze({ part: name, status: 'UNVERIFIED', ready: false,
    reason: 'INDEPENDENT_ATTESTATION_REQUIRED',
    automatic_activation: false, checks, candidates: entry.candidates });
}

/**
 * A boolean alone is not a live proof. This gate requires individually dated
 * observations from an explicitly identified candidate. No fallback is armed
 * by the gate, even when all mandatory probes have passed.
 */
export function verifiedReplacementReadiness(part, candidate, observations = [], { now = Date.now(), maxAgeMs = 15 * 60_000, trustedEvidenceIds = [] } = {}) {
  const name = String(part || '').toLowerCase();
  const entry = REPLACEMENT_CATALOG[name];
  const id = String(candidate || '');
  if (!entry || !entry.candidates.includes(id)) {
    return Object.freeze({ part: name, candidate: id, ready: false, activation_allowed: false, reason: 'CANDIDATE_NOT_IN_CATALOG' });
  }
  // The caller must first validate authentic independent artifacts, then
  // pass only their immutable evidence IDs. No mission or report can self-attest.
  const trusted = new Set(Array.isArray(trustedEvidenceIds) ? trustedEvidenceIds : []);
  const checks = {};
  for (const probe of entry.probes) {
    checks[probe] = (Array.isArray(observations) ? observations : []).some(row => {
      if (row?.candidate !== id || row?.part !== name || row?.probe !== probe || row?.passed !== true) return false;
      if (typeof row?.evidence_id !== 'string' || !row.evidence_id.trim()) return false;
      if (!trusted.has(row.evidence_id)) return false;
      if (typeof row?.observer !== 'string' || !row.observer.trim()) return false;
      const time = Date.parse(String(row?.observed_at || ''));
      return Number.isFinite(time) && time <= now && time >= now - maxAgeMs;
    });
  }
  const ready = entry.probes.every(probe => checks[probe]);
  return Object.freeze({ part: name, candidate: id, ready, activation_allowed: false,
    reason: ready ? 'ATTESTED_PROBES_PASS_MANUAL_APPROVAL_REQUIRED' : 'MISSING_OR_UNTRUSTED_PROOFS',
    checks: Object.freeze(checks) });
}
