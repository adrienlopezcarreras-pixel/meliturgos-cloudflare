import test from 'node:test';
import assert from 'node:assert/strict';
import { sqliteD1 } from './helpers/sqlite-d1.mjs';
import { runD1Retention } from '../src/maintenance/d1-retention.js';

const DAY = 86_400_000;
const now = Date.parse('2026-11-01T00:00:00Z');

async function fixture() {
  const db = sqliteD1();
  await db.prepare('CREATE TABLE dev_jobs (id TEXT PRIMARY KEY, status TEXT, updated_at INTEGER, plan_json TEXT, patch_json TEXT, result_json TEXT, error TEXT)').run();
  await db.prepare('CREATE TABLE audit_logs (id INTEGER PRIMARY KEY, timestamp INTEGER)').run();
  await db.prepare('CREATE TABLE web_sessions (token_hash TEXT PRIMARY KEY, username TEXT, expires_at INTEGER)').run();
  await db.prepare('INSERT INTO web_sessions VALUES (?,?,?), (?,?,?)').bind('expired', 'owner', now - DAY, 'live', 'owner', now + DAY).run();
  await db.prepare('CREATE TABLE computer_commands (id TEXT PRIMARY KEY, status TEXT, created_at INTEGER, result_json TEXT)').run();
  const big = JSON.stringify({ history: 'x'.repeat(5000) });
  for (const [id, status, age] of [['old-failed', 'FAILED', 10], ['old-cancelled', 'CANCELLED', 10], ['recent-failed', 'FAILED', 2], ['old-completed', 'COMPLETED', 30]]) {
    await db.prepare('INSERT INTO dev_jobs VALUES (?,?,?,?,?,?,?)').bind(id, status, now - age * DAY, '{"p":1}', '{"x":1}', big, status === 'FAILED' ? 'ERR_X' : null).run();
  }
  await db.prepare('INSERT INTO audit_logs VALUES (1, ?), (2, ?)').bind(now - 40 * DAY, now - DAY).run();
  await db.prepare('INSERT INTO computer_commands VALUES (?,?,?,?), (?,?,?,?)').bind('c-old', 'COMPLETED', now - 20 * DAY, 'r'.repeat(2000), 'c-run', 'RUNNING', now - 20 * DAY, 'r'.repeat(2000)).run();
  return db;
}

test('weekly retention lightens only known-fate old data and keeps the facts', async () => {
  const db = await fixture();
  const dry = await runD1Retention(db, { now, dryRun: true });
  assert.deepEqual(dry.plan, { jobs: 2, audit_logs: 1, computer_commands: 1, web_sessions: 1 });
  const result = await runD1Retention(db, { now });
  assert.deepEqual(result.changed, { jobs: 2, audit_logs: 1, computer_commands: 1, web_sessions: 1 });
  const failed = await db.prepare("SELECT * FROM dev_jobs WHERE id='old-failed'").first();
  assert.equal(failed.status, 'FAILED');
  assert.equal(failed.plan_json, null);
  assert.equal(JSON.parse(failed.result_json).error, 'ERR_X');
  for (const id of ['recent-failed', 'old-completed']) {
    const kept = await db.prepare('SELECT * FROM dev_jobs WHERE id=?').bind(id).first();
    assert.ok(kept.result_json.length > 5000, id);
  }
  assert.equal((await db.prepare('SELECT count(*) n FROM audit_logs').first()).n, 1);
  assert.equal((await db.prepare("SELECT token_hash t FROM web_sessions").first()).t, 'live');
  assert.equal((await db.prepare("SELECT result_json r FROM computer_commands WHERE id='c-run'").first()).r.length, 2000);
  assert.deepEqual((await runD1Retention(db, { now })).changed, { jobs: 0, audit_logs: 0, computer_commands: 0, web_sessions: 0 });
});
