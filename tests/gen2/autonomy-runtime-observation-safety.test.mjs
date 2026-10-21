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
    local_applied_files: '["src/backup/restore-service.js"]', bridge_tests_passed: 2,
    goal: 'private-goal', result_json: 'secret', token: 'abc123', plan_json: { code: 'private' },
  }) });
  assert.equal(output.status, 0, output.stderr);
  assert.deepEqual(JSON.parse(output.stdout), {
    id: 'mel-autonomy-mel-founder-02-e1-1', status: 'TEACHER_APPROVED',
    acquired_at: 1234, expires_at: 91324, error: 'DETAIL_WITHHELD',
    local_applied_files: ['src/backup/restore-service.js'], bridge_tests_passed: 2,
  });
  assert.doesNotMatch(output.stdout, /private|secret|token/);
  const unsafe = spawnSync('python', ['-c', script], { encoding:'utf8', input:JSON.stringify({local_applied_files:'["../.env"]',token:'PRIVATE'}) });
  assert.equal(unsafe.status,0,unsafe.stderr);
  assert.deepEqual(JSON.parse(unsafe.stdout),{local_applied_files:'DETAIL_WITHHELD'});
  assert.doesNotMatch(unsafe.stdout,/\.env|PRIVATE/);
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

// CODEX: exercise the actual SQL against real persisted bridge metadata.
test('bridge observation reads local execution evidence without retrieving private test output', async () => {
  const { sqliteD1 } = await import('../helpers/sqlite-d1.mjs');
  const { migrate } = await import('../../src/persistence/migrations.js');
  const db=sqliteD1();
  try {
    await migrate(db);
    const result={dev_bridge:{mode:'STRUCTURED_MENTOR_WORK',changed:true,needs_repair:false,
      applied_files:['src/backup/restore-service.js'], approved_base:{candidate_sha:'a'.repeat(40)},
      tests:[{passed:true,exit_code:0,stdout:'PRIVATE_TEST_OUTPUT'},{passed:false,exit_code:1,stderr:'PRIVATE_ERROR'}]},
      repair_cycle:{status:'REQUESTED',attempts:1}};
    await db.prepare("INSERT INTO dev_jobs(id,created_at,updated_at,status,requested_by,goal,optional_context,result_json) VALUES('proof',1,2,'CLAIMED','mel-autonomy','PRIVATE_GOAL','{}',?)").bind(JSON.stringify(result)).run();
    const query=[...source.matchAll(/--command "([^"]+)"/g)].map(x=>x[1]).find(x=>x.includes(' AS bridge_result_mode'));
    assert.ok(query);
    const rows=(await db.prepare(query).all()).results;
    assert.equal(rows[0].bridge_result_mode,'STRUCTURED_MENTOR_WORK');
    assert.equal(rows[0].bridge_tests_count,2);
    assert.equal(rows[0].bridge_tests_passed,1);
    assert.equal(rows[0].repair_attempts,1);
    assert.deepEqual(JSON.parse(rows[0].local_applied_files),['src/backup/restore-service.js']);
    assert.doesNotMatch(JSON.stringify(rows),/PRIVATE_/);
  } finally {db.close();}
});
