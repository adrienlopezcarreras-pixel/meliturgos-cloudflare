import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { assertNoActiveDeploy, requestAutonomousRelease, RELEASE_BRANCH } from '../scripts/mel-autonomous-release-dispatch.mjs';

const MAIN_SHA = 'a'.repeat(40);
const OLD_SHA = 'b'.repeat(40);

test('MEL automation fast-forwards the release pointer then dispatches without human approval or MAX', async () => {
  const operations = [];
  let releaseSha = OLD_SHA;
  const fakeFetch = async (url, request) => {
    const path = new URL(url).pathname;
    operations.push({ path, method: request.method, body: request.body && JSON.parse(request.body) });
    if (path.endsWith('/branches/main')) return { ok: true, status: 200, json: async () => ({ commit: { sha: MAIN_SHA } }) };
    if (path.endsWith('/branches/' + RELEASE_BRANCH)) return { ok: true, status: 200, json: async () => ({ commit: { sha: releaseSha } }) };
    if (path.endsWith('/actions/runs')) return { ok: true, status: 200, json: async () => ({ workflow_runs: [] }) };
    if (path.endsWith('/git/refs/heads/' + RELEASE_BRANCH)) {
      releaseSha = JSON.parse(request.body).sha;
      return { ok: true, status: 200, json: async () => ({}) };
    }
    if (path.endsWith('/dispatches')) return { ok: true, status: 204, json: async () => null };
    throw new Error('Unexpected endpoint: ' + path);
  };
  const result = await requestAutonomousRelease({ token: 'TEST_ONLY', fetchImpl: fakeFetch });
  assert.equal(result.main_sha, MAIN_SHA);
  const patch = operations.find(x => x.method === 'PATCH');
  assert.deepEqual(patch.body, { sha: MAIN_SHA, force: false });
  const dispatch = operations.find(x => x.path.endsWith('/dispatches'));
  assert.equal(dispatch.body.inputs.expected_sha, MAIN_SHA);
  assert.equal(dispatch.body.inputs.approval, 'AUTONOMOUS_POLICY');
  assert.equal(dispatch.body.inputs.autonomous_release, 'true');
  assert.equal(dispatch.body.inputs.owner_max_autorelease, 'false');
  assert.ok(operations.filter(x => x.path.endsWith('/actions/runs')).length === 2);
});

test('MEL automation refuses to overlap active deployment', () => {
  assert.throws(() => assertNoActiveDeploy([{ name: 'deploy-cloudflare-release', status: 'in_progress' }]), /PRODUCTION_DEPLOY_ALREADY_ACTIVE/);
  assert.throws(() => assertNoActiveDeploy(null), /RELEASE_RUN_LIST_MISSING/);
  assert.doesNotThrow(() => assertNoActiveDeploy([{ name: 'deploy-cloudflare-release', status: 'completed' }]));
});

test('MEL automation refuses missing token and wrong repository', async () => {
  await assert.rejects(() => requestAutonomousRelease({ token: '' }), /GH_TOKEN_REQUIRED/);
  await assert.rejects(() => requestAutonomousRelease({ token: 'TEST', repo: 'other/repo' }), /UNEXPECTED_RELEASE_REPOSITORY/);
});

test('MEL autonomous workflow has narrow scoped token and no hardware/MAX side effects', () => {
  const yaml = readFileSync(new URL('../.github/workflows/mel-autonomous-production-release.yml', import.meta.url), 'utf8');
  assert.ok(yaml.includes('on:\\n  workflow_dispatch:'));
  assert.ok(yaml.includes('  contents: write'));
  assert.ok(yaml.includes('  actions: write'));
  assert.ok(yaml.includes("github.actor == 'adrienlopezcarreras-pixel'"));
  assert.ok(yaml.includes('node scripts/mel-autonomous-release-dispatch.mjs'));
  assert.ok(!yaml.includes('wrangler deploy'));
  assert.ok(!yaml.includes('owner_max_autorelease: true'));
});
