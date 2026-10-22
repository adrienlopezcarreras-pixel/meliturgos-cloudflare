import test from 'node:test';
import assert from 'node:assert/strict';
import { assertNotDuplicateRelease } from '../scripts/release-duplicate-sha-gate.mjs';

const sha = 'a'.repeat(40);
function fake(priorConclusion) {
  const requests = [];
  const fetchImpl = async url => {
    requests.push(url);
    const payload = url.includes('/runs?') ? { workflow_runs: [
      { id: 101, name: 'deploy-cloudflare-release', head_sha: sha, status: 'in_progress' },
      { id: 103, name: 'deploy-cloudflare-release', head_sha: sha, status: 'pending' },
      { id: 99, name: 'deploy-cloudflare-release', head_sha: 'b'.repeat(40) },
    ] } : { jobs: [{ name: 'deploy', status: 'completed', conclusion: priorConclusion }] };
    return { ok: true, json: async () => payload };
  };
  return { fetchImpl, requests };
}
const args = { token: 'TEST_ONLY', repository: 'owner/repo', runId: 103, sha };

test('a prior successful deploy of the identical SHA stops queued replay', async () => {
  const { fetchImpl } = fake('success');
  await assert.rejects(assertNotDuplicateRelease({ ...args, fetchImpl }), /RELEASE_SHA_ALREADY_DEPLOYED_IN_RUN_101/);
});
test('a failed prior deploy remains explicitly retryable', async () => {
  const { fetchImpl } = fake('failure');
  await assert.doesNotReject(assertNotDuplicateRelease({ ...args, fetchImpl }));
});
test('GitHub API errors fail closed rather than skip the guard', async () => {
  await assert.rejects(assertNotDuplicateRelease({ ...args, fetchImpl: async () => ({ ok: false, status: 503 }) }), /RELEASE_DUPLICATE_GATE_GITHUB_503/);
});
