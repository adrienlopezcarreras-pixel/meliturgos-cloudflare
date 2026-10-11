import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { proveMedia02, MediaProofError } from '../scripts/prove-media-02-release.mjs';

const SHA = 'a'.repeat(40);
const TOKEN = 'b'.repeat(64);
const ENDPOINT = 'https://mel.example/api/internal/release-launch-bootstrap';
function verifiedProof(sha = SHA) {
  return {
    ok: true, status: 'MEL_MEDIA_02_DONE_VERIFIED_ELIGIBLE',
    done_verified_eligible: true,
    source_sha: sha, deployed_sha: sha,
    capability_count: 12,
    required_capabilities: Array.from({ length: 12 }, (_, i) => 'media.proof.' + i),
    executions: Array.from({ length: 12 }, (_, i) => ({ id: i, ok: true, zero_added_cost: true })),
    all_executions_zero_added_cost: true,
    secret_values_exposed: false,
    autonomy_started: false,
  };
}
const response = (status, body) => ({ status, json: async () => body });
function rig(responses) {
  let now = 0;
  const calls = [], observations = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    return responses[Math.min(calls.length - 1, responses.length - 1)];
  };
  return {
    calls, observations,
    prove: (overrides = {}) => proveMedia02({
      endpoint: ENDPOINT, token: TOKEN, expectedSha: SHA,
      fetchImpl, now: () => now,
      sleep: async ms => { now += ms; },
      log: e => observations.push(e),
      ...overrides,
    }),
  };
}

test('401 BOOTSTRAP_AUTH_REQUIRED during Cloudflare isolate propagation retries then validates exact media proof', async () => {
  const t = rig([
    response(401, { ok: false, code: 'BOOTSTRAP_AUTH_REQUIRED' }),
    response(401, { ok: false, code: 'BOOTSTRAP_AUTH_REQUIRED' }),
    response(200, verifiedProof()),
  ]);
  const result = await t.prove();
  assert.equal(result.attempts, 3);
  assert.equal(result.authPropagationAttempts, 2);
  assert.equal(result.proof.capability_count, 12);
  assert.equal(t.calls[0].options.headers['x-mel-launch-bootstrap'], TOKEN);
  assert.deepEqual(JSON.parse(t.calls[0].options.body), { phase: 'media-proof' });
  assert.equal(t.observations.filter(e => e.event === 'MEDIA_BOOTSTRAP_AUTH_PROPAGATION_RETRY').length, 2);
  assert.ok(!JSON.stringify(t.observations).includes(TOKEN));
});

test('persistent 401 propagation has a hard deadline and never reports green', async () => {
  const t = rig([response(401, { code: 'BOOTSTRAP_AUTH_REQUIRED' })]);
  await assert.rejects(() => t.prove(), e =>
    e instanceof MediaProofError &&
    e.code === 'MEDIA_BOOTSTRAP_AUTH_PROPAGATION_TIMEOUT' &&
    e.details.authPropagationAttempts >= 35 &&
    e.details.authPropagationAttempts <= 40);
  assert.ok(t.calls.length <= 40);
});

test('unrecognized authorization failures are never silently retried', async () => {
  for (const status of [401, 403]) {
    const t = rig([response(status, { code: 'OWNER_AUTH_REQUIRED' })]);
    await assert.rejects(() => t.prove(), { code: 'MEDIA_RELEASE_AUTH_REJECTED' });
    assert.equal(t.calls.length, 1);
  }
});

test('successful HTTP cannot hide stale SHA, incomplete proof, provider cost or automation activation', async () => {
  for (const bad of [
    verifiedProof('c'.repeat(40)),
    { ...verifiedProof(), capability_count: 11 },
    { ...verifiedProof(), executions: verifiedProof().executions.slice(1) },
    { ...verifiedProof(), executions: [{ ok: true, zero_added_cost: false }, ...verifiedProof().executions.slice(1)] },
    { ...verifiedProof(), all_executions_zero_added_cost: false },
    { ...verifiedProof(), autonomy_started: true },
    { ...verifiedProof(), secret_values_exposed: true },
  ]) {
    const t = rig([response(200, bad)]);
    await assert.rejects(() => t.prove(), e =>
      e instanceof MediaProofError &&
      (e.code === 'MEDIA_PROOF_EXACT_SHA_MISMATCH' || e.code === 'MEDIA_PROOF_CONTRACT_INVALID'));
    assert.equal(t.calls.length, 1);
  }
});

test('non-authentication HTTP errors retry at most three times', async () => {
  const recover = rig([
    response(503, { code: 'PROVIDER_TRANSIENT' }),
    response(503, { code: 'PROVIDER_TRANSIENT' }),
    response(200, verifiedProof()),
  ]);
  assert.equal((await recover.prove()).attempts, 3);
  const fail = rig([response(503, { code: 'PROVIDER_TRANSIENT' })]);
  await assert.rejects(() => fail.prove(), { code: 'MEDIA_PROOF_UNAVAILABLE_OR_INVALID' });
  assert.equal(fail.calls.length, 3);
});

test('new release gate retains MEDIA-02 artifact evidence and automatic rollback', () => {
  const yaml = readFileSync(new URL('../.github/workflows/deploy-cloudflare-release.yml', import.meta.url), 'utf8');
  assert.ok(yaml.includes('node scripts/prove-media-02-release.mjs'));
  assert.ok(yaml.includes('Upload MEL-MEDIA-02 exact-SHA evidence'));
  assert.ok(yaml.includes('Automatic rollback accepted to previous stable Cloudflare version.'));
  assert.ok(yaml.includes('MAX kept disabled'));
  assert.ok(!yaml.includes('for ATTEMPT in 1 2 3; do\n            MEDIA_CODE='));
});
