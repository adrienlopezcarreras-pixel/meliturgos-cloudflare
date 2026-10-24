import test from 'node:test';
import assert from 'node:assert/strict';
import { sqliteD1 } from '../helpers/sqlite-d1.mjs';
import { retireLegacyDevJobs } from '../../src/maintenance/global-reset.js';

test('real SQL reset preserves terminal, delivered, review-ready and unknown work byte for byte; rerun is idempotent', async () => {
  const db = sqliteD1();
  try {
    await db.prepare('CREATE TABLE dev_jobs(id TEXT PRIMARY KEY,status TEXT,requested_by TEXT,updated_at INTEGER,error TEXT,result_json TEXT)').run();
    await db.prepare('CREATE TABLE dev_bridge_state(bridge_id TEXT PRIMARY KEY,last_seen INTEGER,status TEXT,metadata_json TEXT)').run();
    const preserved = ['DONE_VERIFIED','COMPLETED','COMMITTED','CANCELLED','FAILED','ACCEPTED','DELIVERED','READY_FOR_REVIEW','RELEASE_CANDIDATE','FUTURE_STATUS'];
    for (const status of [...preserved,'QUEUED','TEACHER_APPROVED']) {
      await db.prepare('INSERT INTO dev_jobs VALUES(?,?,?,?,?,?)').bind(status,status,'mel-autonomy',5,'original','{"evidence":"keep"}').run();
    }
    await db.prepare('INSERT INTO dev_jobs VALUES(?,?,?,?,?,?)').bind('unrelated','QUEUED','professor',5,'original','{}').run();
    const before = (await db.prepare('SELECT * FROM dev_jobs ORDER BY id').all()).results;
    const input = { owner_approved:true, producers_paused:true, backup:{verified:true,restore_tested:true,reference:'isolated-test-only',sha256:'a'.repeat(64)} };
    const result = await retireLegacyDevJobs(db,input,{now:100});
    assert.equal(result.before,2);
    assert.equal(result.changed,2);
    const after = (await db.prepare('SELECT * FROM dev_jobs ORDER BY id').all()).results;
    for (const row of before.filter(row=>preserved.includes(row.status)||row.id==='unrelated')) {
      assert.deepEqual(after.find(item=>item.id===row.id),row);
    }
    assert.equal((await retireLegacyDevJobs(db,input,{now:101})).changed,0);
    assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM dev_jobs').first()).n,before.length);
  } finally { db.close(); }
});
