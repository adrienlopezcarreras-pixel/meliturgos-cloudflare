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
    if (path.endsWith('/actions/workflows/deploy-cloudflare-release.yml/runs')) return { ok: true, status: 200, json: async () => ({ workflow_runs: [] }) };
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
  assert.ok(operations.filter(x => x.path.endsWith('/actions/workflows/deploy-cloudflare-release.yml/runs')).length === 2);
  assert.ok(!operations.some(x => x.path.includes('branches/release%2F')), 'run preflight must not filter away main-ref dispatches');
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
  assert.ok(yaml.startsWith('name: mel-autonomous-production-release'));
  assert.ok(yaml.includes('  contents: write'));
  assert.ok(yaml.includes('  actions: write'));
  assert.ok(yaml.includes("github.actor == 'adrienlopezcarreras-pixel'"));
  assert.ok(yaml.includes('node scripts/mel-autonomous-release-dispatch.mjs'));
  assert.ok(!yaml.includes('wrangler deploy'));
  assert.ok(!yaml.includes('owner_max_autorelease: true'));
});

test('successful releases do not recursively re-dispatch when main is already current', async () => {
  const touched = [];
  const fakeFetch = async (url, req) => {
    const path = new URL(url).pathname;
    touched.push(req.method + ' ' + path);
    if (path.endsWith('/branches/main') || path.endsWith('/branches/' + RELEASE_BRANCH))
      return { ok: true, status: 200, json: async () => ({ commit: { sha: MAIN_SHA } }) };
    if (path.endsWith('/actions/workflows/deploy-cloudflare-release.yml/runs'))
      return { ok: true, status: 200, json: async () => ({ workflow_runs: [] }) };
    throw new Error('Unexpected production mutation: ' + path);
  };
  const result = await requestAutonomousRelease({ token: 'TEST_ONLY', fetchImpl: fakeFetch });
  assert.equal(result.accepted, false);
  assert.equal(result.reason, 'ALREADY_CURRENT');
  assert.ok(touched.every(line => line.startsWith('GET ')));
});

test('only successful completed release workflows with the canonical release branch can automatically reconcile', () => {
  const yaml = readFileSync(new URL('../.github/workflows/mel-autonomous-production-release.yml', import.meta.url), 'utf8');
  assert.ok(yaml.includes('  workflow_run:'));
  assert.ok(yaml.includes('    types:'));
  assert.ok(yaml.includes('      - completed'));
  assert.ok(yaml.includes("github.event.workflow_run.conclusion == 'success'"));
  assert.ok(yaml.includes("github.event.workflow_run.head_branch == 'release/mel-hardware-v0.1.0'"));
});

test('unattended main-push deployments are opt-in and restricted to protected branches', () => {
  const yaml = readFileSync(new URL('../.github/workflows/mel-autonomous-production-release.yml', import.meta.url), 'utf8');
  assert.ok(yaml.includes('  push:'));
  assert.ok(yaml.includes('      - main'));
  assert.ok(yaml.includes("vars.MEL_AUTONOMOUS_MAIN_PUSH_ENABLED == 'true'"));
  assert.ok(yaml.includes("github.ref == 'refs/heads/main'"));
  assert.ok(yaml.includes("MEL_REQUIRE_PROTECTED_REFS: ${{ github.event_name == 'push' && 'true' || 'false' }}"));
});

test('unprotected main or release refuses unattended promotion before any mutation', async () => {
  for (const pair of [[false, true], [true, false], [false, false]]) {
    const requests = [];
    const fetchImpl = async (url, options) => {
      const path = new URL(url).pathname;
      requests.push({ path, method: options.method });
      if (path.endsWith('/branches/main'))
        return { ok: true, status: 200, json: async () => ({ protected: pair[0], commit: { sha: MAIN_SHA } }) };
      if (path.endsWith('/branches/' + RELEASE_BRANCH))
        return { ok: true, status: 200, json: async () => ({ protected: pair[1], commit: { sha: OLD_SHA } }) };
      throw new Error('MUTATION_ATTEMPTED_WITH_UNPROTECTED_BRANCH');
    };
    await assert.rejects(
      () => requestAutonomousRelease({ token: 'TEST_ONLY', fetchImpl, requireProtectedRefs: true }),
      /PROTECTED_MAIN_AND_RELEASE_BRANCHES_REQUIRED/,
    );
    assert.ok(requests.every(x => x.method === 'GET'));
  }
});

test('both protected refs continue through existing exact-SHA and concurrency gates', async () => {
  let reads = 0;
  const fetchImpl = async (url, options) => {
    const path = new URL(url).pathname;
    reads += 1;
    if (path.endsWith('/branches/main'))
      return { ok: true, status: 200, json: async () => ({ protected: true, commit: { sha: MAIN_SHA } }) };
    if (path.endsWith('/branches/' + RELEASE_BRANCH))
      return { ok: true, status: 200, json: async () => ({ protected: true, commit: { sha: MAIN_SHA } }) };
    if (path.endsWith('/actions/workflows/deploy-cloudflare-release.yml/runs'))
      return { ok: true, status: 200, json: async () => ({ workflow_runs: [] }) };
    throw new Error('UNEXPECTED_PRODUCTION_MUTATION:' + path);
  };
  const result = await requestAutonomousRelease({ token: 'TEST_ONLY', fetchImpl, requireProtectedRefs: true });
  assert.equal(result.reason, 'ALREADY_CURRENT');
  assert.equal(result.accepted, false);
  assert.equal(reads, 3);
});
