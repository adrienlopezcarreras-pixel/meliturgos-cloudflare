import test from 'node:test';
import assert from 'node:assert/strict';
import { rankMissions, extractJsonObject, streamDirectWork } from '../src/revenue/work-stream.js';
import { handleRevenueApi } from '../src/api/revenue-worker-api.js';
import { sqliteD1 } from './helpers/sqlite-d1.mjs';

const NOW = Date.parse('2026-10-17T12:00:00Z');
const task = (id, reward, submissionCount, hours = 24, extra = {}) => ({
  id, status: 'open', reward: String(reward), submissionCount, mode: 'bounty', claimedBy: null, stakeRequired: false,
  expiryTime: new Date(NOW + hours * 3600_000).toISOString(),
  description: '# Mission ' + id + '\nWrite a short explainer article about a public open-source project.', ...extra,
});

function sseStream(chunks) {
  const enc = new TextEncoder();
  return new ReadableStream({ start(c) { for (const t of chunks) c.enqueue(enc.encode('data: ' + JSON.stringify({ response: t }) + '\n\n')); c.enqueue(enc.encode('data: [DONE]\n\n')); c.close(); } });
}

async function readEvents(response) {
  const text = await response.text();
  return text.split('\n').filter(Boolean).map(line => JSON.parse(line));
}

test('missions are ranked by expected value: low competition beats a big crowded bounty', () => {
  const ranked = rankMissions([task('crowded', 10_000_000, 120), task('quiet', 2_000_000, 0), task('soon', 9_000_000, 0, 1)], { now: NOW });
  assert.deepEqual(ranked.map(t => t.id), ['quiet', 'crowded']); // 'soon' expires in 1 h: no time to review
});

test('missions requiring a stake or already claimed are never proposed; drafted ones go last', () => {
  const ranked = rankMissions([
    task('stake', 5_000_000, 0, 24, { stakeRequired: true }),
    task('claimed', 5_000_000, 0, 24, { claimedBy: '0xabc', claimStateKnown: true }),
    task('done', 9_000_000, 0), task('fresh', 1_000_000, 0),
  ], { now: NOW, alreadyDrafted: new Set(['done']) });
  assert.deepEqual(ranked.map(t => t.id), ['fresh', 'done']);
});

test('model JSON is extracted even when wrapped in prose or fences', () => {
  assert.deepEqual(extractJsonObject('Voici :\n```json\n{"eligible":true}\n```'), { eligible: true });
  assert.equal(extractJsonObject('pas de json'), null);
});

test('one streamed request reads offers, assesses, writes and stores a draft (nothing submitted)', async () => {
  const db = sqliteD1();
  const calls = [];
  const env = {
    DB: db,
    AI: {
      async run(model, input) {
        calls.push(input.messages[0].content.startsWith('Tu es MEL WORK') ? 'draft' : 'assess');
        if (input.messages[0].content.startsWith('Tu es MEL WORK')) return sseStream(['Titre\n', 'Corps du livrable.']);
        return { response: 'ok {"eligible":true,"draftable":true,"confidenceBps":9500,"category":"writing","requiresHuman":true,"requiresPhysicalWorld":false,"requiresSecrets":false,"requestsUnsafeAction":false,"humanSteps":["Publier le texte"],"reason":"Rédaction simple"}' };
      },
    },
  };
  const fetchImpl = async () => Response.json({ tasks: [task('crowded', 10_000_000, 120), task('quiet', 2_000_000, 0)] });
  const events = await readEvents(streamDirectWork({ env, fetchImpl, now: () => NOW }));
  const done = events.find(e => e.type === 'done');
  assert.ok(done, JSON.stringify(events));
  assert.equal(done.result.missionId, 'quiet');
  assert.equal(done.result.submitted, false);
  assert.equal(done.result.paid, false);
  assert.equal(done.result.status, 'DRAFT_FOR_OWNER');
  assert.deepEqual(done.result.humanSteps, ['Publier le texte']);
  assert.equal(events.filter(e => e.type === 'delta').map(e => e.text).join(''), 'Titre\nCorps du livrable.');
  assert.deepEqual(calls, ['assess', 'draft']);
  const saved = await db.prepare('SELECT content,status FROM mel_work_artifacts WHERE id=?').bind(done.result.artifactId).first();
  assert.equal(saved.content, 'Titre\nCorps du livrable.');
  const cycle = await db.prepare('SELECT state FROM mel_work_cycles WHERE id=?').bind(done.cycleId).first();
  assert.equal(cycle.state, 'COMPLETE');
});

test('oversized AI chunks never show content that is missing from the persisted draft', async () => {
  const db = sqliteD1();
  const huge = 'A'.repeat(12_500);
  const env = {
    DB: db,
    AI: {
      async run(_model, input) {
        if (input.messages[0].content.startsWith('Tu es MEL WORK')) return sseStream([huge]);
        return { response: JSON.stringify({
          eligible: true, draftable: true, confidenceBps: 9500, category: 'writing',
          requiresHuman: true, requiresPhysicalWorld: false, requiresSecrets: false,
          requestsUnsafeAction: false, humanSteps: ['Publier le texte'],
        }) };
      },
    },
  };
  const events = await readEvents(streamDirectWork({
    env, fetchImpl: async () => Response.json({ tasks: [task('long', 1_000_000, 0)] }), now: () => NOW,
  }));
  const done = events.find(e => e.type === 'done');
  assert.ok(done, JSON.stringify(events.filter(e => e.type !== 'delta')));
  const shown = events.filter(e => e.type === 'delta').map(e => e.text).join('');
  const saved = await db.prepare('SELECT content FROM mel_work_artifacts WHERE id=?')
    .bind(done.result.artifactId).first();
  assert.equal(shown.length, 11_400);
  assert.equal(shown, saved.content);
});

test('unsafe or unreadable assessments are skipped and the cycle ends cleanly without a draft', async () => {
  const db = sqliteD1();
  const env = { DB: db, AI: { async run(_m, input) { if (input.messages[0].content.startsWith('Tu es MEL WORK')) throw new Error('must not draft'); return { response: '{"eligible":false,"confidenceBps":9800,"requiresSecrets":true,"requiresHuman":false,"requiresPhysicalWorld":false,"requestsUnsafeAction":false}' }; } } };
  const fetchImpl = async () => Response.json({ tasks: [task('a', 1_000_000, 0), task('b', 1_000_000, 1)] });
  const events = await readEvents(streamDirectWork({ env, fetchImpl, now: () => NOW }));
  const done = events.find(e => e.type === 'done');
  assert.equal(done.result.status, 'NO_ELIGIBLE_MISSION');
});

test('Taskmarket outage is reported as an error event, not a hang', async () => {
  const env = { DB: sqliteD1(), AI: { run: async () => ({}) } };
  const events = await readEvents(streamDirectWork({ env, fetchImpl: async () => new Response('down', { status: 502 }), now: () => NOW }));
  assert.equal(events.at(-1).type, 'error');
  assert.equal(events.at(-1).code, 'TASKMARKET_UPSTREAM_ERROR');
});

test('owner POST streams NDJSON; anonymous POST is refused', async () => {
  const env = { MELITURGOS_USER: 'adrien', MELITURGOS_PASSWORD: 'test', DB: sqliteD1(), AI: { run: async () => ({}) } };
  const url = 'https://mel.test/api/revenue/direct-work';
  assert.notEqual((await handleRevenueApi(new Request(url, { method: 'POST' }), env)).status, 200);
  const headers = { authorization: 'Basic ' + Buffer.from('adrien:test').toString('base64') };
  const response = await handleRevenueApi(new Request(url, { method: 'POST', headers }), env);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /application\/x-ndjson/);
  await response.body.cancel();
});

test('autonomous cycle keeps only bounties MEL can finish alone and hands the deliverable in herself', async () => {
  const db = sqliteD1();
  const verdict = human => 'ok {"eligible":true,"draftable":true,"confidenceBps":9500,"category":"writing","requiresHuman":' + human + ',"requiresPhysicalWorld":false,"requiresSecrets":false,"requestsUnsafeAction":false,"humanSteps":' + (human ? '["Publier"]' : '[]') + ',"reason":"ok"}';
  const assessed = [];
  const env = { DB: db, AI: { async run(model, input) {
    if (input.messages[0].content.startsWith('Tu es MEL WORK')) return sseStream(['Livrable complet.']);
    const id = /# Mission (\w+)/.exec(input.messages[1].content)[1];
    assessed.push(id);
    return { response: verdict(id === 'publish') };
  } } };
  const fetchImpl = async () => Response.json({ tasks: [task('publish', 9_000_000, 0), task('claimonly', 8_000_000, 0, 24, { mode: 'claim' }), task('solo', 2_000_000, 0)] });
  const queued = [];
  const queueSubmission = async (_env, args) => { queued.push(args); return { status: 'QUEUED' }; };
  const events = await readEvents(streamDirectWork({ env, fetchImpl, now: () => NOW, autonomous: true, queueSubmission }));
  const done = events.find(e => e.type === 'done');
  assert.ok(done, JSON.stringify(events));
  assert.deepEqual(assessed, ['publish', 'solo']); // non-bounty never assessed; human-step offer skipped
  assert.equal(done.result.missionId, 'solo');
  assert.equal(done.result.submission, 'QUEUED');
  assert.equal(done.result.requiresOwnerApproval, false);
  assert.deepEqual(done.result.humanSteps, []);
  assert.equal(queued.length, 1);
  assert.equal(queued[0].mode, 'bounty');
  assert.ok(events.some(e => e.type === 'step' && /remets moi-même/.test(e.text)));
});
