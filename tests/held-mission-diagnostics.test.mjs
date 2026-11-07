import test from 'node:test';
import assert from 'node:assert/strict';
import { sqliteD1 } from './helpers/sqlite-d1.mjs';
import { HELD_MISSION_SQL, sanitizeHeldMission } from '../scripts/read-held-mission-diagnostics.mjs';

test('fixed SELECT reads only the held failed job and exports bounded metadata', async () => {
  const db = sqliteD1();
  try {
    await db.prepare('CREATE TABLE dev_bridge_state (bridge_id TEXT, metadata_json TEXT)').run();
    await db.prepare('CREATE TABLE dev_jobs (id TEXT, status TEXT, error TEXT, result_json TEXT, plan_json TEXT)').run();
    await db.prepare('INSERT INTO dev_bridge_state VALUES (?,?)').bind('mel-autonomy-control', JSON.stringify({ repair: { job_id: 'held' } })).run();
    for (const id of ['held', 'other']) await db.prepare('INSERT INTO dev_jobs VALUES (?,?,?,?,?)').bind(id, 'FAILED', 'BOUNDED_REPAIR_EXHAUSTED', JSON.stringify({ runtime_retry: { attempts: 3 }, private_prompt: 'PRIVATE' }), '{}').run();
    const rows = (await db.prepare(HELD_MISSION_SQL).all()).results;
    assert.equal(rows.length, 1);
    const safe = sanitizeHeldMission(rows);
    assert.equal(safe.jobs[0].status, 'FAILED');
    assert.equal(safe.jobs[0].runtime_attempts, 3);
    assert.equal(JSON.stringify(safe).includes('PRIVATE'), false);
    assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM dev_jobs').first()).n, 2);
  } finally { db.close(); }
});
test('unstructured error text, extra rows and private fields are never exported', () => {
  const safe = sanitizeHeldMission([{ error: 'private message details', goal: 'PRIVATE', original_base_sha: 'unsafe' }, { status: 'PRIVATE' }]);
  assert.equal(safe.jobs.length, 1);
  assert.equal(safe.jobs[0].error, 'UNSTRUCTURED_VALUE_REDACTED');
  assert.equal(safe.jobs[0].original_base_sha, null);
  assert.equal(JSON.stringify(safe).includes('PRIVATE'), false);
});
