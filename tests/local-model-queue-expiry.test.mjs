import test from 'node:test';
import assert from 'node:assert/strict';
import { sqliteD1 } from './helpers/sqlite-d1.mjs';
import { expiredLocalModelCommand, expireQueuedLocalModelCommand, LEGACY_LOCAL_MODEL_MAX_AGE_MS } from '../src/devices/local-model-queue-expiry.js';

test('only expired local model commands are rejected, not unrelated PC work', () => {
  const now = 1_800_000_000_000;
  const row = { id: 'local-1', device_id: 'pc', session_id: 'local-model-local-1', created_at: now - 200_000, plan_json: JSON.stringify({ expires_at: now - 1 }) };
  assert.equal(expiredLocalModelCommand(row, now), true);
  assert.equal(expiredLocalModelCommand({ ...row, plan_json: JSON.stringify({ expires_at: now + 1000 }) }, now), false);
  assert.equal(expiredLocalModelCommand({ ...row, session_id: 'computer-use-1' }, now), false);
  assert.equal(expiredLocalModelCommand({ ...row, created_at: now - LEGACY_LOCAL_MODEL_MAX_AGE_MS - 1, plan_json: '{}' }, now), true);
  assert.equal(expiredLocalModelCommand({ ...row, created_at: now - 1000, plan_json: '{}' }, now), false);
});

test('pending expired local model is failed atomically without affecting unrelated or running work', async () => {
  const db = sqliteD1();
  const now = 1_800_000_000_000;
  try {
    await db.prepare('CREATE TABLE computer_commands (id TEXT PRIMARY KEY, device_id TEXT, session_id TEXT, status TEXT, created_at INTEGER, plan_json TEXT, finished_at INTEGER, error_code TEXT)').run();
    const rows = [
      ['expired','PENDING','local-model-expired',JSON.stringify({expires_at:now-1})],
      ['ordinary','PENDING','computer-use-ordinary',JSON.stringify({expires_at:now-1})],
      ['running','RUNNING','local-model-running',JSON.stringify({expires_at:now-1})],
    ];
    for (const [id,status,session,plan] of rows) {
      await db.prepare('INSERT INTO computer_commands (id,device_id,session_id,status,created_at,plan_json) VALUES (?,?,?,?,?,?)').bind(id,'pc',session,status,now-500,plan).run();
    }
    assert.equal(await expireQueuedLocalModelCommand(db,{id:'expired',device_id:'pc',session_id:'local-model-expired',created_at:now-500,plan_json:rows[0][3]},now),true);
    assert.equal((await db.prepare('SELECT status,error_code FROM computer_commands WHERE id=?').bind('expired').first()).error_code,'LOCAL_MODEL_REQUEST_EXPIRED');
    assert.equal((await db.prepare('SELECT status FROM computer_commands WHERE id=?').bind('ordinary').first()).status,'PENDING');
    assert.equal(await expireQueuedLocalModelCommand(db,{id:'running',device_id:'pc',session_id:'local-model-running',created_at:now-500,plan_json:rows[2][3]},now),true);
    assert.equal((await db.prepare('SELECT status FROM computer_commands WHERE id=?').bind('running').first()).status,'RUNNING');
  } finally { db.close(); }
});
