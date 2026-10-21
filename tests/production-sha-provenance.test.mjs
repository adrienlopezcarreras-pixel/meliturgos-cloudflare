// Codex: a cancelled post-deploy run is still the actually served Worker.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('backup provenance never selects production by a historical GitHub branch', async () => {
  const workflow = await readFile(new URL('../.github/workflows/deploy-cloudflare-release.yml', import.meta.url), 'utf8');
  assert.doesNotMatch(workflow, /actions\/runs\?branch=release%2Fmel-hardware-v0\.1\.0/);
  const identity = workflow.indexOf('- name: Read actual production identity before backup');
  const backup = workflow.indexOf('- name: Refresh current production backup through ephemeral worker');
  assert.ok(identity >= 0 && identity < backup);
  assert.match(workflow, /PREVIOUS_PRODUCTION_VERSION_CHANGED/);
});

const SHA = '6'.repeat(40), OLD = '3'.repeat(40);
const VERSION = '11111111-2222-3333-4444-555555555555';
const deployment = id => ({ success: true, result: { deployments: [{ versions: [{ version_id: id, percentage: 100 }] }] } });
const identity = (sha = SHA) => ({ ok: true, status: 'NO_GO', proof_source: 'internal-exact-sha-cache', candidate_sha: sha });

test('runtime identity remains authoritative even after cancelled release or stale launch cache', async () => {
  const { servedProductionSha } = await import('../scripts/read-production-provenance.mjs');
  assert.equal(servedProductionSha(200, identity()), SHA);
  assert.equal(servedProductionSha(503, { ok: false, status: 'PUBLIC_LAUNCH_READINESS_CACHE_SHA_MISMATCH', proof_source: 'internal-exact-sha-cache', candidate_sha: OLD, expected_sha: SHA }), SHA);
  assert.equal(servedProductionSha(503, { ok: false, status: 'PUBLIC_LAUNCH_READINESS_CACHE_STALE', proof_source: 'internal-exact-sha-cache', candidate_sha: SHA }), SHA);
  for (const body of [{ ...identity(), proof_source: 'github-history' }, { ...identity(), candidate_sha: null }, { ...identity(), status: 'UNKNOWN' }]) {
    assert.throws(() => servedProductionSha(200, body), /PRODUCTION_IDENTITY_UNAVAILABLE/);
  }
  assert.throws(() => servedProductionSha(503, { expected_sha: SHA, status: 'UNKNOWN' }), /PRODUCTION_IDENTITY_UNAVAILABLE/);
});

test('stable version is the current deployment, never an older single-version fallback', async () => {
  const { stableProductionVersionId } = await import('../scripts/read-production-provenance.mjs');
  assert.equal(stableProductionVersionId(deployment(VERSION)), VERSION);
  const mixed = deployment(VERSION);
  mixed.result.deployments.unshift({ versions: [{ version_id: VERSION, percentage: 50 }, { version_id: 'other', percentage: 50 }] });
  assert.throws(() => stableProductionVersionId(mixed), /PRODUCTION_VERSION_NOT_STABLE/);
});

test('observation uses only read-only production and Cloudflare calls, and refuses a changing version', async () => {
  const { observeProductionProvenance } = await import('../scripts/read-production-provenance.mjs');
  const calls = [];
  let versionReads = 0;
  let changing = false;
  const fetchImpl = async (url, options) => {
    calls.push({ url: String(url), method: options.method || 'GET' });
    if (String(url).startsWith('https://api.cloudflare.com/')) {
      versionReads++;
      return Response.json(deployment(changing && versionReads > 1 ? 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' : VERSION));
    }
    return Response.json(identity());
  };
  const args = { accountId: 'a'.repeat(32), apiToken: 'private-test-token', fetchImpl };
  const proof = await observeProductionProvenance(args);
  assert.equal(proof.deployed_sha, SHA);
  assert.equal(proof.cloudflare_version_id, VERSION);
  assert.ok(!JSON.stringify(proof).includes('private-test-token'));
  assert.equal(calls.length, 4);
  assert.ok(calls.every(call => call.method === 'GET' && !call.url.includes('github.com')));
  versionReads = 0; changing = true;
  await assert.rejects(observeProductionProvenance(args), /PRODUCTION_OBSERVATION_CHANGED/);
});
