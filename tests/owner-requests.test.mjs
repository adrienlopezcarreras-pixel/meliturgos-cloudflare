import test from 'node:test';
import assert from 'node:assert/strict';
import { sqliteD1 } from './helpers/sqlite-d1.mjs';
import { answerOwnerRequest, createOwnerRequest, listOwnerRequests, raiseOwnerRequestsForFailedJobs } from '../src/evolution/owner-requests.js';

test('a TEXT request is deduplicated, answered once and re-queues the mission with the answer', async () => {
  const db = sqliteD1();
  const first = await createOwnerRequest(db, { kind: 'TEXT', title: 'Nom du menu', question: 'Quel titre ?', roadmapId: 'MEL-UI-01', goal: 'Créer le menu' });
  const again = await createOwnerRequest(db, { kind: 'TEXT', title: 'Nom du menu', question: 'Quel titre ?', roadmapId: 'MEL-UI-01', goal: 'Créer le menu' });
  assert.equal(first.status, 'CREATED');
  assert.equal(again.status, 'ALREADY_PENDING');
  assert.equal((await listOwnerRequests(db)).length, 1);
  const queued = [];
  const done = await answerOwnerRequest({ DB: db }, { id: first.id, answer: 'Atelier', enqueue: async (o) => { queued.push(o); return { ok: true }; } });
  assert.equal(done.status, 'ANSWERED');
  assert.match(queued[0].goal, /Créer le menu[\s\S]*Réponse du propriétaire : Atelier/);
  assert.equal(queued[0].requestedBy, 'mel-autonomy');
  assert.equal((await listOwnerRequests(db)).length, 0);
  await assert.rejects(answerOwnerRequest({ DB: db }, { id: first.id, answer: 'x' }), { code: 'OWNER_REQUEST_NOT_PENDING' });
});

test('secrets are refused as answers', async () => {
  const db = sqliteD1();
  const { id } = await createOwnerRequest(db, { kind: 'TEXT', title: 'Clé', question: '?' });
  await assert.rejects(answerOwnerRequest({ DB: db }, { id, answer: 'ghp_abcdefghijklmnopqrstuvwxyz0123456789' }), { code: 'OWNER_ANSWER_LOOKS_LIKE_SECRET' });
  assert.equal((await listOwnerRequests(db)).length, 1);
});

test('a mel-autonomy mission failed on a missing connection raises one AUTH request', async () => {
  const db = sqliteD1();
  const now = Date.now();
  await db.prepare('CREATE TABLE dev_jobs (id TEXT, status TEXT, requested_by TEXT, goal TEXT, error TEXT, updated_at INTEGER)').run();
  const insert = (id, error) => db.prepare('INSERT INTO dev_jobs VALUES (?, ?, ?, ?, ?, ?)').bind(id, 'FAILED', 'mel-autonomy', 'Lire Gmail', error, now - 1000).run();
  await insert('mel-autonomy-mel-gmail-02-e1-1', 'COUNCIL_REJECTED_VERIFY_EXISTING: Missing evidence of five read Gmail messages');
  await insert('mel-autonomy-mel-gmail-02-e2-1', 'COUNCIL_REJECTED_VERIFY_EXISTING: Missing evidence of five read Gmail messages');
  await insert('mel-autonomy-mel-core-01-e1-1', 'AUTONOMY_RUNTIME_RETRY_EXHAUSTED:JOB_UPDATE_CONFLICT');
  const swept = await raiseOwnerRequestsForFailedJobs(db, { now });
  assert.equal(swept.created, 1);
  const [request] = await listOwnerRequests(db);
  assert.equal(request.kind, 'AUTH');
  assert.equal(request.roadmap_id, 'MEL-GMAIL-02');
});

test('owner requests are routed, swept daily and shown in the chat', async () => {
  const { readFile } = await import('node:fs/promises');
  assert.match(await readFile('src/ui-entry.js', 'utf8'), /url\.pathname === '\/api\/mel\/owner-requests'/);
  assert.match(await readFile('src/diagnostics/self-audit-supervisor.js', 'utf8'), /capture\('owner-requests'/);
  const ui = await readFile('src/pages/full-interface-v2.js', 'utf8');
  assert.match(ui, /id="ownerRequests"[^>]*hidden/);
  assert.match(ui, /MEL attend de vous/);
});
