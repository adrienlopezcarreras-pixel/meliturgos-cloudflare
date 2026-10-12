#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const SHA40 = /^[0-9a-f]{40}$/;
export class MediaProofError extends Error {
  constructor(code, details = {}) {
    super(code);
    this.name = 'MediaProofError';
    this.code = code;
    this.details = details;
  }
}

export function validateMedia02Proof(proof, expectedSha) {
  if (!SHA40.test(String(expectedSha || ''))) {
    throw new MediaProofError('MEDIA_EXPECTED_SHA_INVALID');
  }
  const sha = String(expectedSha).toLowerCase();
  if (String(proof?.source_sha || '').toLowerCase() !== sha ||
      String(proof?.deployed_sha || '').toLowerCase() !== sha) {
    throw new MediaProofError('MEDIA_PROOF_EXACT_SHA_MISMATCH');
  }
  if (proof?.ok !== true ||
      proof?.status !== 'MEL_MEDIA_02_DONE_VERIFIED_ELIGIBLE' ||
      proof?.done_verified_eligible !== true ||
      Number(proof?.capability_count) !== 12 ||
      !Array.isArray(proof?.required_capabilities) ||
      proof.required_capabilities.length !== 12 ||
      !Array.isArray(proof?.executions) ||
      proof.executions.length !== 12 ||
      proof.executions.some(row => row?.ok !== true || row?.zero_added_cost !== true) ||
      proof?.all_executions_zero_added_cost !== true ||
      proof?.secret_values_exposed !== false ||
      proof?.autonomy_started !== false) {
    throw new MediaProofError('MEDIA_PROOF_CONTRACT_INVALID');
  }
  return proof;
}

// Bounded retry for the specific transient observed in release #38174675502:
// identity accepted exact-SHA bootstrap token, but immediately subsequent media
// request routed to an isolate still holding the old Worker secret.
export async function proveMedia02({
  endpoint, token, expectedSha,
  fetchImpl = fetch, now = Date.now,
  sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds)),
  authPropagationBudgetMs = 180000,
  authRetryIntervalMs = 5000,
  maxOtherAttempts = 3,
  log = () => {},
} = {}) {
  if (!SHA40.test(String(expectedSha || '')) ||
      !/^[0-9a-f]{64}$/.test(String(token || ''))) {
    throw new MediaProofError('MEDIA_RELEASE_CREDENTIAL_FORMAT_INVALID');
  }
  if (!String(endpoint || '').startsWith('https://')) {
    throw new MediaProofError('MEDIA_RELEASE_ENDPOINT_INVALID');
  }
  const started = now();
  let attempts = 0;
  let authPropagationAttempts = 0;
  let otherAttempts = 0;
  while (attempts < 80) {
    attempts += 1;
    let status = 0;
    let body = null;
    try {
      const response = await fetchImpl(endpoint, {
        method: 'POST',
        headers: {
          'x-mel-launch-bootstrap': token,
          'x-mel-release-smoke': '1',
          'content-type': 'application/json',
          'cache-control': 'no-store',
        },
        body: JSON.stringify({ phase: 'media-proof' }),
        signal: AbortSignal.timeout(300000), // Preserve the prior per-request 5-minute budget for 12 sequential capabilities.
      });
      status = response.status;
      try { body = await response.json(); } catch { body = null; }
    } catch {
      status = 0;
    }
    if (status === 200) {
      // A response claiming success for an old SHA, or an incomplete 12/12
      // matrix, is never retryable and cannot pass through this gate.
      const validated = validateMedia02Proof(body, expectedSha);
      log({ event: 'MEDIA_PROOF_VERIFIED', attempts, authPropagationAttempts });
      return { proof: validated, attempts, authPropagationAttempts };
    }
    if (status === 401 && body?.code === 'BOOTSTRAP_AUTH_REQUIRED') {
      authPropagationAttempts += 1;
      if (now() - started >= authPropagationBudgetMs) {
        throw new MediaProofError('MEDIA_BOOTSTRAP_AUTH_PROPAGATION_TIMEOUT',
          { attempts, authPropagationAttempts });
      }
      log({ event: 'MEDIA_BOOTSTRAP_AUTH_PROPAGATION_RETRY', attempts });
      await sleep(authRetryIntervalMs);
      continue;
    }
    if (status === 401 || status === 403) {
      throw new MediaProofError('MEDIA_RELEASE_AUTH_REJECTED', { status, attempts });
    }
    otherAttempts += 1;
    if (otherAttempts >= maxOtherAttempts) {
      throw new MediaProofError('MEDIA_PROOF_UNAVAILABLE_OR_INVALID',
        { status, attempts, otherAttempts, code: String(body?.code || '').slice(0, 120) });
    }
    log({ event: 'MEDIA_PROOF_TRANSIENT_RETRY', status, attempts });
    await sleep(otherAttempts * 3000);
  }
  throw new MediaProofError('MEDIA_PROOF_ATTEMPT_CEILING_REACHED', { attempts });
}

async function main() {
  const expectedSha = String(process.env.EXPECTED_SHA || '').trim().toLowerCase();
  const token = readFileSync('release-bootstrap-token.txt', 'utf8').trim();
  const output = 'mel-media-02-production-proof.json';
  const endpoint = 'https://meliturgos.adrien-lopezcarreras.workers.dev/api/internal/release-launch-bootstrap';
  try {
    const result = await proveMedia02({
      endpoint, token, expectedSha,
      log: event => console.log(JSON.stringify(event)),
    });
    writeFileSync(output, JSON.stringify(result.proof, null, 2) + '\n', { mode: 0o600 });
    console.log('MEL-MEDIA-02 exact-SHA 12/12 live proof passed.');
  } catch (error) {
    // Never persist or log bootstrap token or responses containing secrets.
    const code = error instanceof MediaProofError ? error.code : 'MEDIA_PROOF_RUNTIME_ERROR';
    const sanitized = { ok: false, code, verified: false, source_sha: expectedSha,
      detail: error instanceof MediaProofError ? error.details : {} };
    writeFileSync(output, JSON.stringify(sanitized, null, 2) + '\n', { mode: 0o600 });
    console.error('MEL-MEDIA-02 proof failed: ' + code);
    process.exitCode = 58;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
