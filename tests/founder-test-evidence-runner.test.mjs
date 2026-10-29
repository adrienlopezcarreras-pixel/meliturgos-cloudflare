import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const script = new URL('../scripts/write-founder-test-evidence.mjs', import.meta.url).pathname;
const names = [
  'a completed connected read replays its archived response without any model, provider or archive duplicate',
  'a partial turn and another conversation cannot be mistaken for a completed read receipt',
  'a completed connected read lookup failure stops before models and providers',
];
test('runner receipt binds exact SHA/run and fails closed on absent required test', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'mel-founder-evidence-'));
  try {
    await writeFile(join(dir, 'test-report.log'), 'ok 1 - ' + names[0] + '\\nexit_code=0\\n');
    const result = spawnSync(process.execPath, [script], {
      cwd: dir, encoding: 'utf8',
      env: { ...process.env, TEST_EVIDENCE_SHA:'a'.repeat(40), TEST_EVIDENCE_RUN_ID:'1234', TEST_EVIDENCE_RUN_ATTEMPT:'2' },
    });
    assert.equal(result.status, 0, result.stderr);
    const data = JSON.parse(await readFile(join(dir, 'founder-mission-test-evidence.json'), 'utf8'));
    assert.equal(data.github_run_id, 1234);
    assert.equal(data.candidate_sha, 'a'.repeat(40));
    assert.equal(data.mandatory_tests_verified, false);
    assert.equal(data.tests.filter(x => x.passed).length, 1);
    assert.ok(data.additional_required_proofs.includes('NO_RAW_TOOL_CALL_JSON'));
  } finally { await rm(dir, { recursive:true, force:true }); }
});
