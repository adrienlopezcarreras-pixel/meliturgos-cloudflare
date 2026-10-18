import test from 'node:test';
import assert from 'node:assert/strict';
import { judgeOutcome, reviewSubmissionOutcomes, recentLessons, outcomeSummary, lessonsBlock } from '../src/revenue/work-lessons.js';
import { sqliteD1 } from './helpers/sqlite-d1.mjs';

const MEL = '0xmel', WIN = '0xwinner';
const TASK = '0x' + 'a'.repeat(64);

async function sha(text) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(d), b => b.toString(16).padStart(2, '0')).join('');
}

test('MEL finds her own submission by hash and knows whether she won', async () => {
  const mySha = await sha('mon livrable');
  const subs = [
    { workerAddress: MEL, artifacts: [{ sha256Hash: mySha }] },
    { workerAddress: WIN, fileUrl: 'https://files.test/win.md', artifacts: [{ sha256Hash: 'ff' }] },
  ];
  assert.equal(judgeOutcome({ status: 'open', phase: 'submission' }, subs, mySha).outcome, 'PENDING');
  assert.equal(judgeOutcome({ status: 'completed', phase: 'resolved', awards: [{ workerAddress: MEL.toUpperCase(), isPrimary: true }] }, subs, mySha).outcome, 'WON');
  const lost = judgeOutcome({ status: 'completed', phase: 'resolved', awards: [{ workerAddress: WIN, isPrimary: true }] }, subs, mySha);
  assert.equal(lost.outcome, 'LOST');
  assert.equal(lost.winner.fileUrl, 'https://files.test/win.md');
  assert.equal(judgeOutcome({ status: 'expired', awards: [] }, subs, mySha).outcome, 'NO_AWARD');
});

test('a lost contract becomes a lesson that later cycles receive', async () => {
  const db = sqliteD1();
  const content = 'Mon article sur un projet open source.';
  await db.prepare('CREATE TABLE mel_work_submissions (task_id TEXT PRIMARY KEY, artifact_id TEXT NOT NULL, command_id TEXT, status TEXT NOT NULL, detail TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)').run();
  await db.prepare('CREATE TABLE mel_work_artifacts (id TEXT PRIMARY KEY, mission_id TEXT NOT NULL, content TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL)').run();
  await db.prepare("INSERT INTO mel_work_submissions VALUES (?, 'work-1', 'c', 'SUBMITTED', null, 1, 1)").bind(TASK).run();
  await db.prepare("INSERT INTO mel_work_artifacts VALUES ('work-1', ?, ?, 'DRAFT_UNVERIFIED', 'x')").bind(TASK, content).run();
  const mySha = await sha(content);
  const fetched = [];
  const fetchImpl = async url => {
    fetched.push(url);
    if (url.endsWith('/submissions')) return Response.json([
      { workerAddress: MEL, artifacts: [{ sha256Hash: mySha }] },
      { workerAddress: WIN, fileUrl: 'https://files.test/win.md', artifacts: [{ sha256Hash: 'ff' }] },
    ]);
    if (url === 'https://files.test/win.md') return new Response('# Gagnant\nAvec chiffres et démo.', { headers: { 'content-type': 'text/markdown' } });
    return Response.json({ id: TASK, status: 'completed', phase: 'resolved', description: 'Write an article', submissionCount: 12, awards: [{ workerAddress: WIN, isPrimary: true, workerPayment: '9250000' }] });
  };
  let prompt = '';
  const env = { DB: db, AI: { run: async (_m, input) => { prompt = input.messages[1].content; return { response: '{"lesson":"Ajouter des chiffres et une démo.","skip_similar":false}' }; } } };
  assert.deepEqual(await reviewSubmissionOutcomes(env, { fetchImpl, now: 5 }), { reviewed: 1 });
  assert.match(prompt, /LIVRABLE DE MEL :\nMon article/);
  assert.match(prompt, /LIVRABLE GAGNANT :\n# Gagnant/);
  assert.deepEqual(await recentLessons(db), ['Ajouter des chiffres et une démo.']);
  assert.deepEqual(await outcomeSummary(db), { LOST: 1 });
  assert.match(lessonsBlock(await recentLessons(db)), /LEÇONS DE TES CONTRATS PERDUS/);
  // Settled once: the next hour does not re-read it.
  fetched.length = 0;
  assert.deepEqual(await reviewSubmissionOutcomes(env, { fetchImpl, now: 6 }), { reviewed: 0 });
  assert.equal(fetched.length, 0);
});

test('an unresolved task is left for a later hour and no lesson is invented', async () => {
  const db = sqliteD1();
  await db.prepare('CREATE TABLE mel_work_submissions (task_id TEXT PRIMARY KEY, artifact_id TEXT NOT NULL, command_id TEXT, status TEXT NOT NULL, detail TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)').run();
  await db.prepare("INSERT INTO mel_work_submissions VALUES (?, 'work-1', 'c', 'SUBMITTED', null, 1, 1)").bind(TASK).run();
  const env = { DB: db, AI: { run: async () => { throw new Error('no lesson expected'); } } };
  const r = await reviewSubmissionOutcomes(env, { fetchImpl: async () => Response.json({ status: 'open', phase: 'submission' }) });
  assert.deepEqual(r, { reviewed: 0 });
  assert.deepEqual(await recentLessons(db), []);
});
