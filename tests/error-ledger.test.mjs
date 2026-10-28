import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { sqliteD1 } from './helpers/sqlite-d1.mjs';
import { errorFingerprint, queueErrorRepairs, recordError } from '../src/diagnostics/error-ledger.js';

const T = Date.parse('2026-10-26T07:20:00Z');

test('the same error on the same route is one fingerprint, ids aside', () => {
  assert.equal(errorFingerprint('GET /api/jobs/123', 'X'), errorFingerprint('GET /api/jobs/456', 'X'));
  assert.notEqual(errorFingerprint('POST /api/chat', 'CHAT_INFERENCE_FAILED'), errorFingerprint('POST /api/chat', 'OTHER'));
});

test('every recorded error becomes one MAX task, reopened if it comes back after its repair', async () => {
  const db = sqliteD1();
  for (let i = 0; i < 3; i++) await recordError(db, { source: 'POST /api/chat', code: 'CHAT_INFERENCE_FAILED', now: T });
  const tasks = [];
  const enqueue = async options => { tasks.push(options); return { job_id: 'job-' + tasks.length }; };
  const first = await queueErrorRepairs(db, { enqueue, now: T });
  assert.equal(first.queued, 1);
  assert.equal(tasks[0].requestedBy, 'mel-autonomy');
  assert.equal(tasks[0].source, 'error-ledger');
  assert.match(tasks[0].goal, /CHAT_INFERENCE_FAILED sur POST \/api\/chat \(3 occurrence/);
  assert.equal((await queueErrorRepairs(db, { enqueue, now: T + 3_600_000 })).queued, 0, 'no duplicate while the repair runs');
  await recordError(db, { source: 'POST /api/chat', code: 'CHAT_INFERENCE_FAILED', now: T + 2 * 86_400_000 });
  const again = await queueErrorRepairs(db, { enqueue, now: T + 2 * 86_400_000 });
  assert.equal(again.queued, 1);
  assert.match(tasks[1].goal, /Déjà réparée 1 fois sans effet/);
  assert.notEqual(tasks[1].requestKey, tasks[0].requestKey);
});

test('server errors are captured at the entry and swept every hour', async () => {
  assert.match(await readFile('src/visual-final-entry.js', 'utf8'), /response\.status >= 500[\s\S]*recordError\(env\.DB/);
  assert.match(await readFile('src/diagnostics/self-audit-supervisor.js', 'utf8'), /capture\('error-ledger'/);
});

test('automatic error admission is one per pass and keeps remaining errors in D1', async () => {
  const db = sqliteD1();
  for (const code of ['ERROR_A', 'ERROR_B', 'ERROR_C']) {
    await recordError(db, { source: 'MAX', code, now: T });
  }
  const tasks = [];
  const enqueue = async options => { tasks.push(options); return { job_id: 'job-' + tasks.length }; };
  const first = await queueErrorRepairs(db, { enqueue, now: T, limit: 3 });
  assert.equal(first.queued, 1);
  const waiting = (await db.prepare("SELECT * FROM mel_error_ledger WHERE status = 'OPEN'").all()).results;
  assert.equal(waiting.length, 2, 'unadmitted errors must remain durably OPEN');
  assert.equal((await queueErrorRepairs(db, { enqueue, now: T + 1000, limit: 3 })).queued, 1);
  assert.equal((await queueErrorRepairs(db, { enqueue, now: T + 2000, limit: 3 })).queued, 1);
  assert.equal(tasks.length, 3);
});
