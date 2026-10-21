// CODEX: evidence from real D1 must remain read-only, private and correctly attributed.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const source = readFileSync(new URL('../../.github/workflows/gen2-42-live-proof.yml', import.meta.url), 'utf8');

test('CODEX runtime observation omits private columns and redacts arbitrary diagnostic text', () => {
  const functionText = source.slice(source.indexOf('          def safe_runtime_row(row):'), source.indexOf('          runtime_samples ='));
  assert.ok(functionText.includes('return result'));
  const script = 'import json,re,sys\n' + functionText.split('\n').map(line => line.startsWith('          ') ? line.slice(10) : line).join('\n')
    + '\nprint(json.dumps(safe_runtime_row(json.load(sys.stdin))))';
  const output = spawnSync('python', ['-c', script], { encoding: 'utf8', input: JSON.stringify({
    id: 'mel-autonomy-mel-founder-02-e1-1', status: 'TEACHER_APPROVED',
    acquired_at: 1234, expires_at: 91324, error: 'private content with spaces and a secret',
    goal: 'private-goal', result_json: 'secret', token: 'abc123', plan_json: { code: 'private' },
  }) });
  assert.equal(output.status, 0, output.stderr);
  assert.deepEqual(JSON.parse(output.stdout), {
    id: 'mel-autonomy-mel-founder-02-e1-1', status: 'TEACHER_APPROVED',
    acquired_at: 1234, expires_at: 91324, error: 'DETAIL_WITHHELD',
  });
  assert.doesNotMatch(output.stdout, /private|secret|token/);
});

test('CODEX diagnostic SQL only reads snapshots and cannot manipulate the lease or missions', () => {
  const queries = [...source.matchAll(/--command "([^"]+)"/g)].map(match => match[1]);
  assert.ok(queries.length >= 6);
  for (const query of queries) {
    assert.match(query, /^SELECT\s/i);
    assert.doesNotMatch(query, /;|\b(?:INSERT|UPDATE|DELETE|REPLACE|ALTER|DROP|CREATE)\b/i);
  }
  assert.ok(queries.some(query => query.includes('runtime-lease:autonomy-heartbeat')));
  assert.ok(queries.some(query => query.includes('expires_at')));
  assert.doesNotMatch(source, /'deployed_sha':.*GITHUB_SHA/);
  assert.match(source, /'diagnostic_source_sha': os.environ.get\('GITHUB_SHA'\)/);
});
