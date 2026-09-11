import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectCodeIntegrity, DEFAULT_INTEGRITY_PATHS } from '../src/capabilities/code-integrity-capability.js';
import { createGen2Runtime } from '../src/core/orchestrator/gen2-runtime.js';

function fakeReader({ head = 'a'.repeat(40), files = {} } = {}) {
  return {
    repository: 'owner/repo',
    branch: 'candidate/test',
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

test('Gen2 runtime exposes code.integrity as a low-risk capability', () => {
  const runtime = createGen2Runtime({ env: { MEL_GITHUB_FETCH: async () => new Response('{}', { status: 500 }) } });
  const row = runtime.bus.list().find(item => item.id === 'code.integrity');
  assert.ok(row);
  assert.equal(row.risk, 'LOW');
  assert.equal(row.enabled, true);
});
