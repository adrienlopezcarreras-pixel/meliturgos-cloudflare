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
  const ready = entry.probes.every(probe => checks[probe]);
  return Object.freeze({ part: name, status: ready ? 'PROBES_PASSED_NOT_ACTIVATED' : 'UNVERIFIED', ready, automatic_activation: false, checks, candidates: entry.candidates });
}
