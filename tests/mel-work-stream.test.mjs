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

test('one streamed request reads offers, assesses, writes the deliverable and hands it in by itself', async () => {
  const db = sqliteD1({ maintenanceFence: true });
  const calls = [];
  const env = {
    DB: db,
    AI: {
      async run(model, input) {
        calls.push(input.messages[0].content.startsWith('Tu es MEL WORK') ? 'draft' : 'assess');
        if (input.messages[0].content.startsWith('Tu es MEL WORK')) return sseStream(['Titre\n', 'Corps du livrable.']);
        return { response: 'ok {"eligible":true,"confidenceBps":9500,"category":"writing","requiresHuman":false,"requiresPhysicalWorld":false,"requiresSecrets":false,"requestsUnsafeAction":false,"reason":"Rédaction simple"}' };
      },
    },
  };
  const fetchImpl = async () => Response.json({ tasks: [task('crowded', 10_000_000, 120), task('quiet', 2_000_000, 0)] });
  const queued = [];
  const events = await readEvents(streamDirectWork({ env, fetchImpl, now: () => NOW, queueSubmission: async (_e, args) => { queued.push(args); return { status: 'QUEUED' }; } }));
  const done = events.find(e => e.type === 'done');
  assert.ok(done, JSON.stringify(events));
  assert.equal(done.result.missionId, 'quiet');
  assert.equal(done.result.paid, false);
  assert.equal(done.result.submission, 'QUEUED');
  assert.equal(done.result.requiresOwnerApproval, false);
  assert.equal(queued.length, 1);
  assert.equal(events.filter(e => e.type === 'delta').map(e => e.text).join(''), 'Titre\nCorps du livrable.');
  assert.deepEqual(calls, ['assess', 'draft']);
  const saved = await db.prepare('SELECT content,status FROM mel_work_artifacts WHERE id=?').bind(done.result.artifactId).first();
  assert.equal(saved.content, 'Titre\nCorps du livrable.');
  const cycle = await db.prepare('SELECT state FROM mel_work_cycles WHERE id=?').bind(done.cycleId).first();
  assert.equal(cycle.state, 'COMPLETE');
});

test('oversized AI chunks never show content that is missing from the persisted draft', async () => {
  const db = sqliteD1({ maintenanceFence: true });
  const huge = 'A'.repeat(12_500);
  const env = {
    DB: db,
    AI: {
      async run(_model, input) {
        if (input.messages[0].content.startsWith('Tu es MEL WORK')) return sseStream([huge]);
        return { response: JSON.stringify({
          eligible: true, confidenceBps: 9500, category: 'writing',
          requiresHuman: false, requiresPhysicalWorld: false, requiresSecrets: false,
          requestsUnsafeAction: false,
        }) };
      },
    },
  };
  const events = await readEvents(streamDirectWork({
    env, fetchImpl: async () => Response.json({ tasks: [task('long', 1_000_000, 0)] }), now: () => NOW,
    queueSubmission: async () => ({ status: 'QUEUED' }),
  }));
  const done = events.find(e => e.type === 'done');
  assert.ok(done, JSON.stringify(events.filter(e => e.type !== 'delta')));
  const shown = events.filter(e => e.type === 'delta').map(e => e.text).join('');
  const saved = await db.prepare('SELECT content FROM mel_work_artifacts WHERE id=?')
    .bind(done.result.artifactId).first();
  assert.equal(shown.length, 10_000);
  assert.equal(shown, saved.content);
});

test('unsafe or unreadable assessments are skipped and the cycle ends cleanly without a draft', async () => {
  const db = sqliteD1({ maintenanceFence: true });
  const env = { DB: db, AI: { async run(_m, input) { if (input.messages[0].content.startsWith('Tu es MEL WORK')) throw new Error('must not draft'); return { response: '{"eligible":false,"confidenceBps":9800,"requiresSecrets":true,"requiresHuman":false,"requiresPhysicalWorld":false,"requestsUnsafeAction":false}' }; } } };
  const fetchImpl = async () => Response.json({ tasks: [task('a', 1_000_000, 0), task('b', 1_000_000, 1)] });
  const events = await readEvents(streamDirectWork({ env, fetchImpl, now: () => NOW }));
  const done = events.find(e => e.type === 'done');
  assert.equal(done.result.status, 'NO_ELIGIBLE_MISSION');
});

test('Taskmarket outage is reported as an error event, not a hang', async () => {
  const env = { DB: sqliteD1({ maintenanceFence: true }), AI: { run: async () => ({}) } };
  const events = await readEvents(streamDirectWork({ env, fetchImpl: async () => new Response('down', { status: 502 }), now: () => NOW }));
  assert.equal(events.at(-1).type, 'error');
  assert.equal(events.at(-1).code, 'TASKMARKET_UPSTREAM_ERROR');
});

test('owner POST streams NDJSON; anonymous POST is refused', async () => {
  const env = { MELITURGOS_USER: 'adrien', MELITURGOS_PASSWORD: 'test', DB: sqliteD1({ maintenanceFence: true }), AI: { run: async () => ({}) } };
  const url = 'https://mel.test/api/revenue/direct-work';
  assert.notEqual((await handleRevenueApi(new Request(url, { method: 'POST' }), env)).status, 200);
  const headers = { authorization: 'Basic ' + Buffer.from('adrien:test').toString('base64') };
  const response = await handleRevenueApi(new Request(url, { method: 'POST', headers }), env);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /application\/x-ndjson/);
  await response.body.cancel();
});

test('an offer that needs any human step is skipped: nothing is parked for owner validation', async () => {
  const db = sqliteD1({ maintenanceFence: true });
  const assessed = [];
  const env = { DB: db, AI: { async run(_model, input) {
    if (input.messages[0].content.startsWith('Tu es MEL WORK')) return sseStream(['Livrable rédigé.']);
    const id = /# Mission (\w+)/.exec(input.messages[1].content)[1];
    assessed.push(id);
    return { response: JSON.stringify({
      eligible: true, confidenceBps: 9500, category:'writing',
      requiresHuman: id === 'publish', requiresPhysicalWorld: false, requiresSecrets: false, requestsUnsafeAction: false,
    }) };
  } } };
  const queued = [];
  const events = await readEvents(streamDirectWork({
    env, now:()=>NOW, autonomous:true,
    fetchImpl:async()=>Response.json({tasks:[task('publish',9_000_000,0),task('solo',2_000_000,0)]}),
    queueSubmission:async(_env,args)=>{queued.push(args);return {status:'QUEUED'};},
  }));
  const done = events.find(e=>e.type==='done');
  assert.ok(done, JSON.stringify(events));
  assert.deepEqual(assessed,['publish','solo']);
  assert.equal(done.result.missionId,'solo');
  assert.equal(done.result.requiresOwnerApproval,false);
  assert.equal(queued.length,1);
  assert.ok(!events.some(e=>e.type==='step'&&/validation/.test(e.text)));
});

test('autonomous bounty without human steps can still enter the independent submission queue', async () => {
  const db = sqliteD1({ maintenanceFence: true });
  const env = { DB: db, AI:{ async run(_model,input) {
    if(input.messages[0].content.startsWith('Tu es MEL WORK')) return sseStream(['Livrable autonome.']);
    return {response:JSON.stringify({eligible:true,confidenceBps:9600,category:'writing',
      requiresHuman:false,requiresPhysicalWorld:false,requiresSecrets:false,requestsUnsafeAction:false})};
  } } };
  const queued=[];
  const events=await readEvents(streamDirectWork({
    env, now:()=>NOW, autonomous:true,
    fetchImpl:async()=>Response.json({tasks:[task('solo',2_000_000,0)]}),
    queueSubmission:async(_env,args)=>{queued.push(args);return {status:'QUEUED'};},
  }));
  const done=events.find(e=>e.type==='done');
  assert.ok(done,JSON.stringify(events));
  assert.equal(done.result.missionId,'solo');
  assert.equal(done.result.submission,'QUEUED');
  assert.equal(done.result.requiresOwnerApproval,false);
  assert.deepEqual(done.result.humanSteps,[]);
  assert.equal(queued.length,1);
  assert.equal(queued[0].mode,'bounty');
  assert.ok(events.some(e=>e.type==='step'&&/remets moi-même/.test(e.text)));
});

test('claim-style tasks are never taken: MEL only does bounties she can hand in herself', async () => {
  const db=sqliteD1({ maintenanceFence: true });
  let drafted=0, submitted=0;
  const env={DB:db,AI:{async run(_model,input){
    if(input.messages[0].content.startsWith('Tu es MEL WORK')){drafted++;return sseStream(['x']);}
    return {response:JSON.stringify({eligible:true,confidenceBps:9800,requiresHuman:false,requiresPhysicalWorld:false,requiresSecrets:false,requestsUnsafeAction:false})};
  }}};
  const events=await readEvents(streamDirectWork({
    env,now:()=>NOW,autonomous:true,
    fetchImpl:async()=>Response.json({tasks:[task('claimable',2_000_000,0,24,{mode:'claim'})]}),
    queueSubmission:async()=>{submitted++;return {status:'QUEUED'};},
  }));
  const done=events.find(e=>e.type==='done');
  assert.equal(done.result.status,'NO_ELIGIBLE_MISSION');
  assert.equal(drafted,0);
  assert.equal(submitted,0);
});

test('lessons from lost contracts are given to the assessor and the writer', async () => {
  const db=sqliteD1({ maintenanceFence: true });
  await db.prepare('CREATE TABLE mel_work_outcomes (task_id TEXT PRIMARY KEY, outcome TEXT NOT NULL, lesson TEXT, reward TEXT, winner TEXT, competitors INTEGER, created_at INTEGER NOT NULL)').run();
  await db.prepare("INSERT INTO mel_work_outcomes VALUES ('0x1','LOST','Donner un exemple chiffré dès le début.',null,null,9,1)").run();
  const prompts=[];
  const env={DB:db,AI:{async run(_model,input){
    prompts.push(input.messages[1].content);
    if(input.messages[0].content.startsWith('Tu es MEL WORK'))return sseStream(['Livrable.']);
    return {response:JSON.stringify({eligible:true,confidenceBps:9800,requiresHuman:false,requiresPhysicalWorld:false,requiresSecrets:false,requestsUnsafeAction:false})};
  }}};
  const events=await readEvents(streamDirectWork({env,now:()=>NOW,autonomous:true,
    fetchImpl:async()=>Response.json({tasks:[task('t1',1_000_000,0)]}),queueSubmission:async()=>({status:'QUEUED'})}));
  assert.ok(events.some(e=>e.type==='step'&&/1 leçon/.test(e.text)));
  assert.equal(prompts.length,2);
  for(const p of prompts)assert.match(p,/LEÇONS DE TES CONTRATS PERDUS[\s\S]*exemple chiffré/);
});
