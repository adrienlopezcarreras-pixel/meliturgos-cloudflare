import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runScheduledMelWork, retryPendingSubmissions } from '../src/revenue/work-schedule.js';
import { sqliteD1 } from './helpers/sqlite-d1.mjs';

const at = hour => new Date(Date.UTC(2026, 9, 17, hour, 17));
const ndjson = events => ({ text: async () => events.map(e => JSON.stringify(e)).join('\n') + '\n' });
const env = (db = sqliteD1({ maintenanceFence: true })) => ({ DB: db, AI: { run: async () => ({}) } });

test('runs one autonomous cycle at scheduled hours and reports the hand-in', async () => {
  const calls = [];
  const run = async args => { calls.push(args); return ndjson([{ type: 'step', text: 'x' }, { type: 'done', result: { status: 'DRAFT_UNVERIFIED', artifactId: 'work-' + 'a'.repeat(64), missionId: 'm1', submission: 'QUEUED' } }]); };
  assert.deepEqual(await runScheduledMelWork(env(), { now: at(6), run }), { status: 'DRAFT_UNVERIFIED', artifactId: 'work-' + 'a'.repeat(64), missionId: 'm1', submission: 'QUEUED' });
  assert.equal(calls[0].autonomous, true);
  assert.equal((await runScheduledMelWork(env(), { now: at(7), run })).status, 'NOT_SCHEDULED_HOUR');
  assert.equal(calls.length, 1);
});

test('stops at the daily draft limit, and can be switched off', async () => {
  const db = sqliteD1({ maintenanceFence: true });
  await db.prepare('CREATE TABLE mel_work_artifacts (id TEXT PRIMARY KEY, mission_id TEXT, content TEXT, status TEXT, created_at TEXT)').run();
  const recent = new Date(at(11).getTime() - 3600_000).toISOString();
  for (const id of ['a', 'b', 'c', 'd']) await db.prepare("INSERT INTO mel_work_artifacts VALUES (?, 'm', 'x', 'DRAFT_UNVERIFIED', ?)").bind(id, recent).run();
  const run = async () => { throw new Error('must not run'); };
  assert.deepEqual(await runScheduledMelWork(env(db), { now: at(12), run }), { status: 'DAILY_DRAFT_LIMIT', drafts: 4 });
  assert.equal((await runScheduledMelWork({ ...env(), MEL_WORK_AUTONOMOUS: 'off' }, { now: at(12), run })).status, 'DISABLED');
});

test('a deliverable finished while the PC was off is handed in later, once', async () => {
  const db = sqliteD1({ maintenanceFence: true });
  await db.prepare('CREATE TABLE mel_work_cycles (id TEXT PRIMARY KEY, state TEXT NOT NULL, result TEXT, updated_at TEXT NOT NULL)').run();
  const result = { status: 'DRAFT_UNVERIFIED', artifactId: 'work-' + 'b'.repeat(64), missionId: '0x' + '1'.repeat(64), mode: 'bounty', submission: 'COMPANION_OFFLINE' };
  await db.prepare("INSERT INTO mel_work_cycles VALUES ('c1','COMPLETE',?,?)").bind(JSON.stringify(result), at(5).toISOString()).run();
  const queued = [];
  const queue = async (_env, args) => { queued.push(args); return { status: 'QUEUED' }; };
  assert.deepEqual(await retryPendingSubmissions(env(db), { now: at(7).getTime(), queue }), { retried: 1 });
  assert.equal(queued[0].taskId, result.missionId);
  assert.equal(JSON.parse((await db.prepare("SELECT result FROM mel_work_cycles WHERE id='c1'").first()).result).submission, 'QUEUED');
  assert.deepEqual(await retryPendingSubmissions(env(db), { now: at(8).getTime(), queue }), { retried: 0 });
});

test('the hourly maintenance cron runs the scheduled MEL WORK cycle', async () => {
  const source = await readFile(new URL('../src/index.js', import.meta.url), 'utf8');
  const cron = source.indexOf("const maintenanceCron = cron === '17 * * * *';");
  assert.ok(source.indexOf('runScheduledMelWork(env)', cron) > cron);
});
