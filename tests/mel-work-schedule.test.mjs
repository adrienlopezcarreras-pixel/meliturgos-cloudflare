import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runScheduledMelWork } from '../src/revenue/work-schedule.js';
import { sqliteD1 } from './helpers/sqlite-d1.mjs';

const at = hour => new Date(Date.UTC(2026, 9, 17, hour, 17));
const ndjson = events => ({ text: async () => events.map(e => JSON.stringify(e)).join('\n') + '\n' });
const env = (db = sqliteD1()) => ({ DB: db, AI: { run: async () => ({}) } });

test('runs one draft cycle at scheduled hours and reports its result', async () => {
  let runs = 0;
  const run = async () => { runs += 1; return ndjson([{ type: 'step', text: 'x' }, { type: 'done', result: { status: 'DRAFT_FOR_OWNER', artifactId: 'work-' + 'a'.repeat(64), missionId: 'm1' } }]); };
  assert.deepEqual(await runScheduledMelWork(env(), { now: at(6), run }), { status: 'DRAFT_FOR_OWNER', artifactId: 'work-' + 'a'.repeat(64), missionId: 'm1' });
  assert.equal((await runScheduledMelWork(env(), { now: at(7), run })).status, 'NOT_SCHEDULED_HOUR');
  assert.equal(runs, 1);
});

test('pauses while 3 drafts wait for the owner, and can be switched off', async () => {
  const db = sqliteD1();
  await db.prepare('CREATE TABLE mel_work_artifacts (id TEXT PRIMARY KEY, mission_id TEXT, content TEXT, status TEXT, created_at TEXT)').run();
  for (const id of ['a', 'b', 'c']) await db.prepare("INSERT INTO mel_work_artifacts VALUES (?, 'm', 'x', 'DRAFT_UNVERIFIED', '')").bind(id).run();
  const run = async () => { throw new Error('must not run'); };
  assert.deepEqual(await runScheduledMelWork(env(db), { now: at(12), run }), { status: 'WAITING_FOR_OWNER_REVIEW', pending: 3 });
  assert.equal((await runScheduledMelWork({ ...env(), MEL_WORK_AUTONOMOUS: 'off' }, { now: at(12), run })).status, 'DISABLED');
});

test('the hourly maintenance cron runs the scheduled MEL WORK cycle', async () => {
  const source = await readFile(new URL('../src/index.js', import.meta.url), 'utf8');
  const cron = source.indexOf("const maintenanceCron = cron === '17 * * * *';");
  assert.ok(source.indexOf('runScheduledMelWork(env)', cron) > cron);
});
