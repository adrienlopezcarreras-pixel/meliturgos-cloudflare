#!/usr/bin/env node
import { readFileSync } from 'node:fs';

export const REQUIRED_PROOFS = Object.freeze(['readiness','http','capabilities','skills','browser','file','sovereignty']);

export function verifyDownstreamProofAttestation(value, { expectedSha, runId } = {}) {
  const sha = String(expectedSha || '').toLowerCase();
  if (!/^[0-9a-f]{40}$/.test(sha)) throw new Error('ATTESTATION_EXPECTED_SHA_INVALID');
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('ATTESTATION_FORMAT_INVALID');
  if (value.schema !== 'mel.release.downstream-proof.v1') throw new Error('ATTESTATION_SCHEMA_INVALID');
  if (value.expected_sha !== sha) throw new Error('ATTESTATION_SHA_MISMATCH');
  if (!/^[1-9][0-9]*$/.test(String(value.github_run_id || ''))) throw new Error('ATTESTATION_RUN_INVALID');
  if (runId !== undefined && String(value.github_run_id) !== String(runId)) throw new Error('ATTESTATION_RUN_MISMATCH');
  if (!/^[1-9][0-9]*$/.test(String(value.github_run_attempt || ''))) throw new Error('ATTESTATION_ATTEMPT_INVALID');
  if (value.verification !== 'seven-jobs-success') throw new Error('ATTESTATION_VERIFICATION_INVALID');
  if (!Array.isArray(value.passed_jobs) || value.passed_jobs.length !== REQUIRED_PROOFS.length ||
      new Set(value.passed_jobs).size !== REQUIRED_PROOFS.length ||
      REQUIRED_PROOFS.some(name => !value.passed_jobs.includes(name))) {
    throw new Error('ATTESTATION_PROOFS_INCOMPLETE');
  }
  return { verified: true, expected_sha: sha, github_run_id: String(value.github_run_id) };
}

if (process.argv[1] && import.meta.url === new URL('file://' + process.argv[1]).href) {
  const [, , filename, sha, runId] = process.argv;
  if (!filename || !sha || !runId) throw new Error('USAGE: verify-downstream-proof-attestation.mjs FILE EXPECTED_SHA RUN_ID');
  verifyDownstreamProofAttestation(JSON.parse(readFileSync(filename,'utf8')), {expectedSha:sha,runId});
  console.log('Downstream proof attestation schema and identity verified; independently verify GitHub run conclusion before trusting it.');
}
