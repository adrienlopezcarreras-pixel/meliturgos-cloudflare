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
 * Diagnostic-only checklist. Raw observations and caller-supplied "trusted"
 * IDs cannot independently establish the authenticity of any live proof.
 */
export function verifiedReplacementReadiness(part, candidate, observations = [], { now = Date.now(), maxAgeMs = 15 * 60_000 } = {}) {
  const name = String(part || '').toLowerCase(), id = String(candidate || '');
  const entry = REPLACEMENT_CATALOG[name];
  if (!entry || !entry.candidates.includes(id)) return Object.freeze({
    part: name, candidate: id, ready: false, activation_allowed: false,
    reason: 'CANDIDATE_NOT_IN_CATALOG',
  });
  const checks = Object.freeze(Object.fromEntries(entry.probes.map(probe => [probe,
    (Array.isArray(observations) ? observations : []).some(row =>
      row?.part === name && row?.candidate === id && row?.probe === probe && row?.passed === true
      && Number.isFinite(Date.parse(String(row?.observed_at || '')))
      && Date.parse(row.observed_at) <= now
      && Date.parse(row.observed_at) >= now - maxAgeMs),
  ])));
  return Object.freeze({
    part: name, candidate: id, ready: false, activation_allowed: false,
    reason: 'SIGNED_ATTESTATIONS_REQUIRED', checks,
  });
}

// This canonical text is signed by the independent probe producer with an
// out-of-repository secret. The same format is used to verify each observation.
export function replacementAttestationPayload(row) {
  return [
    'mel.replacement-probe/v1', String(row?.part || ''),
    String(row?.candidate || ''), String(row?.probe || ''),
    row?.passed === true ? 'PASS' : 'FAIL',
    String(row?.observer || ''), String(row?.evidence_id || ''),
    String(row?.observed_at || ''), String(row?.source_sha || '').toLowerCase(),
  ].join('\n');
}

function rejectAttestation(part, candidate, reason, probes = []) {
  return Object.freeze({
    part, candidate, ready: false, activation_allowed: false,
    automatic_activation: false, reason,
    checks: Object.freeze(Object.fromEntries(probes.map(probe => [probe, false]))),
    authenticated_count: 0,
  });
}

/**
 * Production proof gate. Even a complete set of authenticated, recent probes
 * authorizes only a review, NEVER a migration or deployment. The signing key
 * and permitted observer must be configured out of band.
 */
export async function attestedReplacementReadiness(part, candidate, observations = [], {
  secret, expectedSourceSha, trustedObserver, now = Date.now(),
  maxAgeMs = 15 * 60_000, cryptoImpl = globalThis.crypto,
} = {}) {
  const name = String(part || '').toLowerCase(), id = String(candidate || '');
  const entry = REPLACEMENT_CATALOG[name];
  if (!entry || !entry.candidates.includes(id))
    return rejectAttestation(name, id, 'CANDIDATE_NOT_IN_CATALOG');
  if (typeof secret !== 'string' || secret.length < 32 || !cryptoImpl?.subtle
      || !/^[a-f0-9]{40}$/i.test(String(expectedSourceSha || ''))
      || typeof trustedObserver !== 'string' || !trustedObserver.trim())
    return rejectAttestation(name, id, 'TRUSTED_ATTESTATION_CONFIG_REQUIRED', entry.probes);

  const key = await cryptoImpl.subtle.importKey(
    'raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify'],
  );
  const valid = [], evidenceIds = new Set();
  for (const row of (Array.isArray(observations) ? observations.slice(0, 100) : [])) {
    if (row?.part !== name || row?.candidate !== id || !entry.probes.includes(row?.probe)
        || row?.passed !== true || row?.observer !== trustedObserver
        || String(row?.source_sha || '').toLowerCase() !== String(expectedSourceSha).toLowerCase()
        || typeof row?.evidence_id !== 'string' || !row.evidence_id.trim()
        || evidenceIds.has(row.evidence_id)
        || !/^[0-9a-f]{64}$/i.test(String(row?.signature || ''))) continue;
    const t = Date.parse(String(row?.observed_at || ''));
    if (!Number.isFinite(t) || t > now || t < now - maxAgeMs) continue;
    const signature = Uint8Array.from(
      row.signature.match(/.{2}/g), pair => parseInt(pair, 16),
    );
    const signed = new TextEncoder().encode(replacementAttestationPayload(row));
    if (await cryptoImpl.subtle.verify('HMAC', key, signature, signed)) {
      evidenceIds.add(row.evidence_id);
      valid.push(row);
    }
  }
  const checks = Object.freeze(Object.fromEntries(entry.probes.map(probe =>
    [probe, valid.some(row => row.probe === probe)])));
  const ready = entry.probes.every(probe => checks[probe]);
  return Object.freeze({
    part: name, candidate: id, ready, activation_allowed: false,
    automatic_activation: false, authenticated_count: valid.length,
    source_sha: String(expectedSourceSha).toLowerCase(),
    reason: ready ? 'SIGNED_PROBES_PASS_OWNER_APPROVAL_REQUIRED' : 'MISSING_OR_UNTRUSTED_SIGNED_PROOFS',
    checks,
  });
}
