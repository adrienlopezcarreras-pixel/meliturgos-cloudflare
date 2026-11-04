import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import {
  REPLACEMENT_CATALOG, attestedReplacementReadiness, replacementAttestationPayload,
} from '../src/continuity/replacement-catalog.js';

const secret = 'test-only-independent-probe-secret-0123456789';
const otherSecret = 'another-test-only-probe-secret-0123456789';
const sourceSha = 'b'.repeat(40);
const now = Date.parse('2026-11-03T21:30:00.000Z');
const options = { secret, expectedSourceSha: sourceSha, trustedObserver: 'independent-probe', now, cryptoImpl: webcrypto };

async function sign(row, signingSecret = secret) {
  const key = await webcrypto.subtle.importKey(
    'raw', new TextEncoder().encode(signingSecret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const bytes = new Uint8Array(await webcrypto.subtle.sign(
    'HMAC', key, new TextEncoder().encode(replacementAttestationPayload(row)),
  ));
  return { ...row, signature: [...bytes].map(v => v.toString(16).padStart(2, '0')).join('') };
}

async function allProbes(part, candidate, observed_at = '2026-11-03T21:29:00.000Z') {
  return Promise.all(REPLACEMENT_CATALOG[part].probes.map((probe, index) => sign({
    part, candidate, probe, passed: true,
    observer: 'independent-probe', evidence_id: part + '-' + index,
    observed_at, source_sha: sourceSha,
  })));
}

test('all 7 bricks can be independently attested but never automatically activated', async () => {
  for (const [part, entry] of Object.entries(REPLACEMENT_CATALOG)) {
    const candidate = entry.candidates[0];
    const evidence = await allProbes(part, candidate);
    const result = await attestedReplacementReadiness(part, candidate, evidence, options);
    assert.equal(result.ready, true, part);
    assert.equal(result.activation_allowed, false, part);
    assert.equal(result.automatic_activation, false, part);
    assert.equal(result.authenticated_count, entry.probes.length, part);
    assert.equal(result.reason, 'SIGNED_PROBES_PASS_OWNER_APPROVAL_REQUIRED', part);
  }
});
test('tampered, unsigned, forged-observer and wrong-key attestations fail closed', async () => {
  const part = 'cloudflare', candidate = REPLACEMENT_CATALOG[part].candidates[0];
  const good = await allProbes(part, candidate);
  const corrupt = { ...good[0], source_sha: 'c'.repeat(40) };
  const switched = { ...good[0], candidate: REPLACEMENT_CATALOG[part].candidates[1] };
  const forgedObserver = { ...good[0], observer: 'someone-else' };
  const unsigned = { ...good[0], signature: undefined };
  const wrongKey = await sign({ ...good[0], signature: undefined }, otherSecret);
  for (const bad of [corrupt, switched, forgedObserver, unsigned, wrongKey]) {
    const result = await attestedReplacementReadiness(part, candidate, [bad, ...good.slice(1)], options);
    assert.equal(result.ready, false);
    assert.equal(result.authenticated_count, good.length - 1);
  }
});
test('expired, future-dated, reused proof IDs and wrong source SHA are rejected', async () => {
  const part = 'shards', candidate = REPLACEMENT_CATALOG[part].candidates[0];
  const fresh = await allProbes(part, candidate);
  const old = await allProbes(part, candidate, '2026-11-03T19:00:00Z');
  assert.equal((await attestedReplacementReadiness(part, candidate, old, options)).ready, false);
  const future = await allProbes(part, candidate, '2026-11-03T22:00:00Z');
  assert.equal((await attestedReplacementReadiness(part, candidate, future, options)).ready, false);
  assert.equal((await attestedReplacementReadiness(part, candidate, fresh, { ...options, expectedSourceSha:'c'.repeat(40) })).ready, false);
  const sameId = await Promise.all(fresh.map(row => sign({ ...row, evidence_id: 'reused-id' })));
  assert.equal((await attestedReplacementReadiness(part, candidate, sameId, options)).ready, false);
});
test('missing independent configuration, unknown candidates and incomplete probes stay unverified', async () => {
  const part = 'model', candidate = REPLACEMENT_CATALOG[part].candidates[0];
  const rows = await allProbes(part, candidate);
  for (const config of [{}, { ...options, secret:'too short' },
    { ...options, trustedObserver:'' }, { ...options, expectedSourceSha:'main' }]) {
    const result = await attestedReplacementReadiness(part, candidate, rows, config);
    assert.equal(result.ready, false);
    assert.equal(result.activation_allowed, false);
  }
  assert.equal((await attestedReplacementReadiness(part, 'fake-host', rows, options)).ready, false);
  const partial = await attestedReplacementReadiness(part, candidate, rows.slice(1), options);
  assert.equal(partial.ready, false);
  assert.equal(partial.authenticated_count, rows.length - 1);
});
