import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { verifyContingencyProbeReports, signContingencyProbeReport } from '../src/continuity/contingency-probe-auth.js';
const secret = 'test-only-secret-not-for-production-0123456789';
const now = Date.parse('2026-11-03T20:00:00Z');
async function signed(part, up, observed_at = '2026-11-03T19:59:00Z') {
  const r = { part, up, observer:'test-external-monitor', evidence_id:'probe-test-001', observed_at };
  const message = ['mel.contingency-probe/v1', r.part, r.up ? 'UP':'DOWN', r.observer, r.evidence_id, r.observed_at].join('\\n');
  const key = await webcrypto.subtle.importKey('raw', new TextEncoder().encode(secret), {name:'HMAC', hash:'SHA-256'}, false, ['sign']);
  r.signature = [...new Uint8Array(await webcrypto.subtle.sign('HMAC', key, new TextEncoder().encode(message)))].map(v=>v.toString(16).padStart(2,'0')).join('');
  return r;
}
test('unsigned and mis-signed probe reports never produce outages', async () => {
  const valid=await signed('github',false);
  const unsigned={...valid,signature:undefined};
  const changed={...valid,part:'model'};
  for (const report of [unsigned,changed]) {
    const result=await verifyContingencyProbeReports([report],{secret,now,cryptoImpl:webcrypto});
    assert.equal(result.verified_count,0);
    assert.deepEqual(result.observed,{});
  }
});
test('correct signed and fresh reports are accepted, without a secret all reports fail closed', async () => {
  const valid=await signed('github',false);
  const verified=await verifyContingencyProbeReports([valid],{secret,now,cryptoImpl:webcrypto});
  assert.equal(verified.verified_count,1);
  assert.equal(verified.observed.githubUp,false);
  const missing=await verifyContingencyProbeReports([valid],{now,cryptoImpl:webcrypto});
  assert.deepEqual(missing.observed,{});
  const stale=await verifyContingencyProbeReports([await signed('github',false,'2026-11-02T00:00:00Z')],{secret,now,cryptoImpl:webcrypto});
  assert.deepEqual(stale.observed,{});
});

test('independent watcher produces a signed, verifiable health artifact but never authorizes failover', async () => {
  const report = await signContingencyProbeReport({
    part: 'cloudflare', up: false, observer:'github-actions-external-monitor',
    evidence_id:'github-run-test-1', observed_at:'2026-11-03T19:59:00Z',
  }, { secret, cryptoImpl:webcrypto });
  assert.match(report.signature, /^[0-9a-f]{64}$/);
  const result = await verifyContingencyProbeReports([report], {secret, now, cryptoImpl:webcrypto});
  assert.equal(result.verified_count, 1);
  assert.equal(result.observed.cloudflareUp, false);
  const tampered = await verifyContingencyProbeReports([{...report, up:true}], {secret, now, cryptoImpl:webcrypto});
  assert.equal(tampered.verified_count, 0);
  await assert.rejects(
    () => signContingencyProbeReport(report, {secret:'short',cryptoImpl:webcrypto}),
    error => error?.code === 'PROBE_SIGNING_CONFIG_INVALID',
  );
});
