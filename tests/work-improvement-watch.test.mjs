import test from 'node:test';
import assert from 'node:assert/strict';
import { recordWorkRejection, workGapDiscoveries, normalizeMissingCapability } from '../src/revenue/work-improvement.js';
import { explainDiscovery, selectEcosystemDiscoveryCandidate } from '../src/evaluation/ecosystem-discovery-planner.js';
import { sqliteD1 } from './helpers/sqlite-d1.mjs';

const caps = [
  { id: 'media.image.generate', name: 'Image generation', category: 'media', status: 'AVAILABLE' },
  { id: 'web.research', name: 'Web research', category: 'knowledge', status: 'AVAILABLE' },
];
const mission = (id, reward) => ({ id: '0x' + id.repeat(64).slice(0, 64), reward: String(reward), description: '# Make a short promo video\nNeeds a 30 s video.' });

test('skipped paid offers become justified, sourced improvement proposals', async () => {
  const db = sqliteD1();
  const now = Date.parse('2026-10-18T06:00:00Z');
  await recordWorkRejection(db, mission('a', 5_000_000), { missingCapability: 'video.generate', reason: 'Vidéo requise', category: 'video' }, { now });
  await recordWorkRejection(db, mission('b', 3_000_000), { missingCapability: 'Video Generate', reason: 'Clip demandé' }, { now });
  await recordWorkRejection(db, mission('c', 9_000_000), { missingCapability: 'aucune', reason: 'n/a' }, { now });
  await recordWorkRejection(db, mission('d', 1_000_000), { missingCapability: 'x.post', reason: 'Compte X' }, { now });
  const items = await workGapDiscoveries({ db, capabilities: caps, now });
  // Ranked by USDC at stake: video (8 USDC, 2 offers) before x.post (1 USDC).
  assert.deepEqual(items.map(i => i.fingerprint), ['work:video.generate', 'work:x.post']);
  const item = items[0];
  assert.equal(item.fingerprint, 'work:video.generate');
  assert.deepEqual(item.work_demand.offers, 2);
  assert.equal(item.work_demand.reward_usdc, 8);
  assert.equal(item.sources.length, 2);
  assert.match(item.sources[0].url, /^https:\/\/api\.taskmarket\.dev\/api\/tasks\/0x/);
  const r = explainDiscovery(item);
  assert.match(r.why[0], /2 offre\(s\) rémunérée\(s\).*8\.00 USDC manqués en 14 jours/);
  assert.ok(r.comparison.length >= 1);
  assert.ok(r.verdict.length > 5);
  // Paid gaps are handed to the existing development pipeline first.
  const candidate = selectEcosystemDiscoveryCandidate({ items: [
    { fingerprint: 'capability:mcp', capability_hint: 'mcp', action: 'UNBLOCK_EXISTING', evidence_status: 'SOURCED_OBSERVATION', sources: [{ url: 'https://x' }], best_match: { id: 'mcp.call' } },
    item,
  ] });
  assert.equal(candidate.fingerprint, 'work:video.generate');
  assert.match(candidate.goal, /^Priorité revenus MEL WORK : 2 offre\(s\) rémunérée\(s\) \(8\.00 USDC\)/);
});

test('explanations compare with the closest existing capability and alternatives', () => {
  const r = explainDiscovery({
    action: 'REUSE_EXISTING', observed_on: ['openai-news', 'kaggle'], citations_count: 3, seen_count: 4,
    best_match: { id: 'media.image.generate', state: 'AVAILABLE', score: 5, matched_terms: ['image', 'generation'] },
    alternatives: [{ id: 'media.image.generate', state: 'AVAILABLE' }, { id: 'design.render', state: 'BLOCKED' }],
    roadmap_matches: [{ id: 'GEN2-42', title: 'Capability Watch', status: 'DONE_VERIFIED' }],
  });
  assert.match(r.why.join(' '), /Observé dans 2 veille\(s\).*3 citation/);
  assert.match(r.comparison[0], /Existant le plus proche : media\.image\.generate \(disponible, score 5, termes communs : image, generation\)/);
  assert.match(r.comparison[1], /design\.render \(bloquée\)/);
  assert.match(r.comparison[2], /GEN2-42/);
  assert.match(r.verdict, /^Réutiliser media\.image\.generate/);
});

test('missing capability names are normalised and empty answers ignored', () => {
  assert.equal(normalizeMissingCapability('Vidéo Generate'), 'video.generate');
  assert.equal(normalizeMissingCapability('aucune'), '');
  assert.equal(normalizeMissingCapability(''), '');
});

test('a WORK cycle records the capability missing for each skipped paid offer', async () => {
  const { streamDirectWork } = await import('../src/revenue/work-stream.js');
  const db = sqliteD1();
  const NOW = Date.parse('2026-10-17T12:00:00Z');
  const env = { DB: db, AI: { async run(_m, input) {
    if (input.messages[0].content.startsWith('Tu es MEL WORK')) throw new Error('no draft expected');
    return { response: JSON.stringify({ eligible: false, confidenceBps: 9500, requiresHuman: false, requiresPhysicalWorld: false, requiresSecrets: false, requestsUnsafeAction: false, missingCapability: 'video.generate', reason: 'Vidéo requise' }) };
  } } };
  const task = { id: '0x' + 'e'.repeat(64), status: 'open', reward: '4000000', submissionCount: 0, mode: 'bounty', claimedBy: null, stakeRequired: false, expiryTime: new Date(NOW + 86_400_000).toISOString(), description: '# Promo video\nMake a 30 s video.' };
  const res = await streamDirectWork({ env, now: () => NOW, autonomous: true, fetchImpl: async () => Response.json({ tasks: [task] }) });
  await res.text();
  const row = await db.prepare('SELECT missing, reward_usdc FROM mel_work_rejections').first();
  assert.equal(row.missing, 'video.generate');
  assert.equal(row.reward_usdc, 4);
});

test('a WORK cycle cut mid-way is marked interrupted, not left running', async () => {
  const { runScheduledMelWork } = await import('../src/revenue/work-schedule.js');
  const db = sqliteD1({ maintenanceFence: true });
  await db.prepare('CREATE TABLE mel_work_cycles (id TEXT PRIMARY KEY, state TEXT NOT NULL, result TEXT, updated_at TEXT NOT NULL)').run();
  await db.prepare("INSERT INTO mel_work_cycles VALUES ('old','RUNNING',NULL,'2026-10-18T05:00:00.000Z'),('fresh','RUNNING',NULL,'2026-10-18T06:50:00.000Z')").run();
  await runScheduledMelWork({ DB: db, AI: { run: async () => ({}) } }, { now: new Date('2026-10-18T07:05:00Z'), run: async () => new Response('') });
  const rows = (await db.prepare('SELECT id, state FROM mel_work_cycles ORDER BY id').all()).results;
  assert.deepEqual(rows.map(r => r.id + ':' + r.state), ['fresh:RUNNING', 'old:INTERRUPTED']);
});

test('a skipped paid offer reaches development within the hour, without waiting for the 6-hour watch', async () => {
  const { runEcosystemCapabilityWatch } = await import('../src/evaluation/capability-watch-runtime.js');
  const db = sqliteD1();
  const now = Date.parse('2026-10-18T09:17:00Z');
  const env = { DB: db, MELITURGOS_USER: 'adrien' };
  // First call runs the ecosystem watch (offline sources), the second is within the 6 h interval.
  await runEcosystemCapabilityWatch(env, { now: now - 3_600_000, fetchImpl: async () => new Response('', { status: 503 }), developmentEnqueue: async () => ({ status: 'QUEUED', job_id: null }) }).catch(() => null);
  for (const [id, reward] of [['c', '6000000'], ['d', '2000000']]) await recordWorkRejection(db, { id: '0x' + id.repeat(64), reward, description: '# Promo video' }, { missingCapability: 'video.generate', reason: 'Vidéo requise' }, { now });
  const queued = [];
  const r = await runEcosystemCapabilityWatch(env, { now, fetchImpl: async () => new Response('', { status: 503 }), developmentEnqueue: async args => { queued.push(args); return { status: 'QUEUED', job_id: 'job-1', created: true }; } });
  assert.notEqual(r.status, 'RAN');
  assert.equal(queued.length, 1);
  assert.match(queued[0].goal, /^Priorité revenus MEL WORK : 2 offre\(s\) rémunérée\(s\) \(8\.00 USDC\)/);
  assert.equal(queued[0].requestedBy, 'mel-autonomy');
});
