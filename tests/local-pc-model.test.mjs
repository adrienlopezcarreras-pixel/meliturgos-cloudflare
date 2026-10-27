import test from 'node:test';
import assert from 'node:assert/strict';
import { localPcCommand, compactMessages, runLocalPcModel } from '../src/models/local-pc-model.js';
import { sqliteD1 } from './helpers/sqlite-d1.mjs';

test('conversation reaches PowerShell only as base64; command stays under the engine limit', () => {
  const evil = "'; Remove-Item C:\\ -Recurse; '" + 'é'.repeat(20000);
  const { command, timeout_ms } = localPcCommand({ messages: [{ role: 'system', content: 'S'.repeat(5000) }, { role: 'user', content: evil }] });
  assert.ok(command.length <= 8192, String(command.length));
  assert.ok(timeout_ms <= 600000);
  assert.doesNotMatch(command, /Remove-Item/);
  assert.match(command, /http:\/\/127\.0\.0\.1:11434\/api\/chat/);
  const b64 = command.match(/FromBase64String\('([A-Za-z0-9+/=]+)'\)/)[1];
  const body = JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
  assert.equal(body.model, 'qwen3:8b');
  assert.equal(body.stream, false);
  assert.equal(body.messages.at(-1).role, 'user');
  assert.throws(() => localPcCommand({ model: "x';calc", messages: [] }), /LOCAL_MODEL_INVALID/);
});

test('compaction keeps the system head and the latest turns', () => {
  const msgs = compactMessages([{ role: 'system', content: 'sys' }, { role: 'user', content: 'a' }, { role: 'assistant', content: 'b' }, { role: 'user', content: 'c' }]);
  assert.deepEqual(msgs.map(m => m.content), ['sys', 'a', 'b', 'c']);
});

test('no Companion online or authorized: nothing is queued', async () => {
  const db = sqliteD1();
  await db.prepare("CREATE TABLE computer_devices(id TEXT PRIMARY KEY,token_hash TEXT,name TEXT,platform TEXT,capabilities TEXT,allowed_apps TEXT,halted INTEGER DEFAULT 0,created_at INTEGER,last_seen_at INTEGER,metadata TEXT)").run();
  await db.prepare("CREATE TABLE computer_commands(id TEXT PRIMARY KEY,device_id TEXT,session_id TEXT,plan_json TEXT,status TEXT,created_at INTEGER,claimed_at INTEGER,finished_at INTEGER,result_json TEXT,error_code TEXT)").run();
  await db.prepare("INSERT INTO computer_devices VALUES('pc','h','PC','windows','[]','[]',0,0,?,?)").bind(Date.now(), JSON.stringify({ remote_access_enabled: false, engine_heartbeat_at: Date.now() })).run();
  const result = await runLocalPcModel({ env: { DB: db }, messages: [{ role: 'user', content: 'x' }] });
  assert.equal(result.code, 'COMPANION_OFFLINE_OR_NOT_AUTHORIZED');
  assert.equal(result.reason, 'COMPANION_REMOTE_ACCESS_DISABLED');
  assert.equal((await db.prepare('SELECT COUNT(*) n FROM computer_commands').first()).n, 0);
});

test('online authorized Companion: the queued command result is decoded (accents kept, thinking removed)', async () => {
  const db = sqliteD1();
  await db.prepare("CREATE TABLE computer_devices(id TEXT PRIMARY KEY,token_hash TEXT,name TEXT,platform TEXT,capabilities TEXT,allowed_apps TEXT,halted INTEGER DEFAULT 0,created_at INTEGER,last_seen_at INTEGER,metadata TEXT)").run();
  await db.prepare("CREATE TABLE computer_commands(id TEXT PRIMARY KEY,device_id TEXT,session_id TEXT,plan_json TEXT,status TEXT,created_at INTEGER,claimed_at INTEGER,finished_at INTEGER,result_json TEXT,error_code TEXT)").run();
  await db.prepare("INSERT INTO computer_devices VALUES('pc','h','PC','windows','[]','[]',0,0,?,?)").bind(Date.now(), JSON.stringify({ remote_access_enabled: true, engine_heartbeat_at: Date.now() })).run();
  const sleep = async () => {
    const row = await db.prepare("SELECT id FROM computer_commands WHERE status='PENDING'").first();
    if (row) {
      const stdout = JSON.stringify({ model: 'qwen3:8b', text_b64: Buffer.from('<think>x</think>Été à Paris', 'utf8').toString('base64') });
      await db.prepare("UPDATE computer_commands SET status='SUCCEEDED',result_json=? WHERE id=?").bind(JSON.stringify({ outputs: [{ stdout }] }), row.id).run();
    }
  };
  const result = await runLocalPcModel({ env: { DB: db }, messages: [{ role: 'user', content: 'x' }], sleep });
  assert.deepEqual(result, { ok: true, text: 'Été à Paris', model: 'pc:qwen3:8b' });
});

test('local model requests expire below the MAX tick and record a terminal failure', async () => {
  const db = sqliteD1();
  let clock = 1_800_000_000_000;
  try {
    await db.prepare("CREATE TABLE computer_devices(id TEXT PRIMARY KEY,token_hash TEXT,name TEXT,platform TEXT,capabilities TEXT,allowed_apps TEXT,halted INTEGER DEFAULT 0,created_at INTEGER,last_seen_at INTEGER,metadata TEXT)").run();
    await db.prepare("CREATE TABLE computer_commands(id TEXT PRIMARY KEY,device_id TEXT,session_id TEXT,plan_json TEXT,status TEXT,created_at INTEGER,claimed_at INTEGER,finished_at INTEGER,result_json TEXT,error_code TEXT)").run();
    await db.prepare("INSERT INTO computer_devices VALUES('pc','h','PC','windows','[]','[]',0,0,?,?)")
      .bind(clock, JSON.stringify({ remote_access_enabled: true, local_compute_enabled: true, engine_heartbeat_at: clock })).run();
    const answer = await runLocalPcModel({
      env: { DB: db }, messages: [{ role: 'user', content: 'Write code' }],
      now: () => clock,
      sleep: async () => { clock += 211_000; },
    });
    assert.equal(answer.code, 'LOCAL_MODEL_TIMEOUT');
    const command = await db.prepare('SELECT * FROM computer_commands').first();
    assert.equal(command.status, 'FAILED');
    assert.equal(command.error_code, 'LOCAL_MODEL_TIMEOUT');
    const plan = JSON.parse(command.plan_json);
    assert.equal(plan.expires_at - command.created_at, 210_000);
    assert.equal(plan.steps[0].payload.timeout_ms, 210_000);
  } finally { db.close(); }
});
