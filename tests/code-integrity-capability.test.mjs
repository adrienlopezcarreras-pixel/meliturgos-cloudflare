import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectCodeIntegrity, DEFAULT_INTEGRITY_PATHS, resolveDeploymentIdentity } from '../src/capabilities/code-integrity-capability.js';
import { createGen2Runtime } from '../src/core/orchestrator/gen2-runtime.js';

function fakeReader({ head = 'a'.repeat(40), files = {}, branch = 'candidate/test' } = {}) {
  return {
    repository: 'owner/repo',
    branch,
    async head() { return head; },
    async read(path) {
      if (files[path] instanceof Error) throw files[path];
      return { path, sha: `${path.length}`.padStart(40, '0').slice(0, 40), content: files[path] ?? `// ${path}\nexport default true;` };
    },
  };
}

test('code integrity passes for bounded critical files on expected head', async () => {
  const head = 'b'.repeat(40);
  const report = await inspectCodeIntegrity({ reader: fakeReader({ head }), expectedHead: head });
  assert.equal(report.status, 'PASS');
  assert.equal(report.head_matches, true);
  assert.equal(report.checked_files, DEFAULT_INTEGRITY_PATHS.length);
  assert.equal(report.failures.length, 0);
  assert.ok(report.files.every(file => file.bytes > 0));
});

test('code integrity fails closed on head mismatch and unresolved merge marker', async () => {
  const actual = 'c'.repeat(40);
  const expected = 'd'.repeat(40);
  const report = await inspectCodeIntegrity({
    reader: fakeReader({ head: actual, files: { 'src/index.js': '<<<<<<< HEAD\nours\n=======\ntheirs\n>>>>>>> branch' } }),
    paths: ['src/index.js'],
    expectedHead: expected,
  });
  assert.equal(report.status, 'FAIL');
  assert.equal(report.head_matches, false);
  assert.ok(report.failures.some(row => row.code === 'HEAD_MISMATCH'));
  assert.ok(report.failures.some(row => row.code === 'MERGE_MARKER_FOUND'));
});

test('code integrity rejects malformed expected head and caps custom path count', async () => {
  await assert.rejects(
    () => inspectCodeIntegrity({ reader: fakeReader(), expectedHead: 'not-a-sha' }),
    error => error.code === 'EXPECTED_HEAD_INVALID'
  );
  const paths = Array.from({ length: 20 }, (_, index) => `src/file-${index}.js`);
  const report = await inspectCodeIntegrity({ reader: fakeReader(), paths });
  assert.equal(report.checked_files, 12);
});

test('deployment identity is reported only from an exact 40-character commit', () => {
  const sha = 'ABCDEF0123456789ABCDEF0123456789ABCDEF01';
  const exact = resolveDeploymentIdentity({
    MEL_GITHUB_REPOSITORY: 'owner/repo',
    MEL_DEPLOYED_GIT_BRANCH: 'release/live',
    MEL_DEPLOYED_GIT_SHA: sha,
  });
  assert.equal(exact.repository, 'owner/repo');
  assert.equal(exact.branch, 'release/live');
  assert.equal(exact.commit, sha.toLowerCase());
  assert.equal(exact.exact_identity_known, true);
  assert.equal(exact.source, 'runtime_env');

  const malformed = resolveDeploymentIdentity({
    MEL_DEPLOYED_GIT_BRANCH: 'release/live',
    MEL_DEPLOYED_GIT_SHA: 'not-a-sha',
  });
  assert.equal(malformed.branch, 'release/live');
  assert.equal(malformed.commit, null);
  assert.equal(malformed.commit_known, false);
  assert.equal(malformed.exact_identity_known, false);
  assert.equal(malformed.commit_format_valid, false);
});

test('self-check keeps deployed identity separate from the inspected candidate branch', async () => {
  const deployedSha = 'd'.repeat(40);
  const report = await inspectCodeIntegrity({
    reader: fakeReader({ head: 'c'.repeat(40), branch: 'candidate/test' }),
    deploymentIdentity: {
      repository: 'owner/repo',
      branch: 'release/live',
      commit: deployedSha,
      branch_known: true,
      commit_known: true,
      exact_identity_known: true,
      commit_format_valid: true,
      source: 'runtime_env',
    },
  });

  assert.equal(report.status, 'PASS');
  assert.equal(report.branch, 'candidate/test');
  assert.equal(report.self_code.branch, 'release/live');
  assert.equal(report.self_code.commit, deployedSha);
  assert.equal(report.self_code.exact_identity_known, true);
  assert.equal(report.self_code.inspected_branch_matches_deployment, false);
  assert.equal(report.self_code.inspected_head_matches_deployment, false);
});

test('self-check proves when inspected branch and HEAD are exactly the deployed code', async () => {
  const deployedSha = 'e'.repeat(40);
  const report = await inspectCodeIntegrity({
    reader: fakeReader({ head: deployedSha, branch: 'release/live' }),
    deploymentIdentity: {
      repository: 'owner/repo',
      branch: 'release/live',
      commit: deployedSha,
      branch_known: true,
      commit_known: true,
      exact_identity_known: true,
      commit_format_valid: true,
      source: 'runtime_env',
    },
  });

  assert.equal(report.self_code.inspected_branch_matches_deployment, true);
  assert.equal(report.self_code.inspected_head_matches_deployment, true);
});

test('Gen2 runtime exposes code.integrity as a low-risk capability', () => {
  const runtime = createGen2Runtime({ env: { MEL_GITHUB_FETCH: async () => new Response('{}', { status: 500 }) } });
  const row = runtime.bus.list().find(item => item.id === 'code.integrity');
  assert.ok(row);
  assert.equal(row.risk, 'LOW');
  assert.equal(row.enabled, true);
});
