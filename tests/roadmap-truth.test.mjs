import test from 'node:test';
import assert from 'node:assert/strict';
import { sqliteD1 } from './helpers/sqlite-d1.mjs';
import { computeRoadmapTruth, classifyRoadmapItem, ROADMAP_PROOF_SOURCES } from '../src/roadmap/roadmap-truth.js';
import { MASTER_ROADMAP, flattenRoadmap } from '../src/roadmap/master-roadmap.js';

async function db() {
  const d = sqliteD1();
  await d.prepare('CREATE TABLE audit_logs(id INTEGER PRIMARY KEY, action TEXT, details_json TEXT, created_at INTEGER)').run();
  await d.prepare('CREATE TABLE computer_commands(id TEXT PRIMARY KEY,device_id TEXT,session_id TEXT,plan_json TEXT,status TEXT,created_at INTEGER,claimed_at INTEGER,finished_at INTEGER,result_json TEXT,error_code TEXT)').run();
  return d;
}
const now = Date.parse('2026-10-17T12:00:00Z');
async function exec(d, capability, status, ageMs = 3600_000, error = null, baseTime = now) {
  await d.prepare('INSERT INTO audit_logs(action,details_json,created_at) VALUES(?,?,?)').bind('capability_bus', JSON.stringify({ capability, status, error_code: error }), baseTime - ageMs).run();
}

test('roadmap status comes from real production executions, not from the declared label', async () => {
  const d = await db();
  await exec(d, 'code.read', 'SUCCEEDED');
  await exec(d, 'gmail.messages.search', 'SUCCEEDED');
  await exec(d, 'calendar.events.read', 'FAILED', 3600_000, 'GOOGLE_CALENDAR_REAUTH_REQUIRED');
  await exec(d, 'augmentio.fanout', 'FAILED', 3600_000, 'NO_ZERO_COST_PROVIDER_AVAILABLE');
  await exec(d, 'model.council', 'SUCCEEDED', 10 * 86_400_000); // older than 7 days: not a current proof
  await d.prepare('INSERT INTO computer_commands VALUES(?,?,?,?,?,?,?,?,?,?)').bind('c1', 'pc', 's', JSON.stringify({ steps: [{ action: 'cursor.move' }, { action: 'pointer.click' }] }), 'SUCCEEDED', now - 1000, null, now - 900, '{}', null).run();
  const truth = await computeRoadmapTruth(d, MASTER_ROADMAP, { now });
  assert.equal(truth.available, true);
  assert.equal(truth.total, flattenRoadmap().length);
  assert.equal(truth.items['MEL-CODE-01'].truth, 'VERIFIED_LIVE');
  assert.equal(truth.items['GEN2-33'].truth, 'PARTIAL_LIVE', 'Gmail works, calendar fails, tasks/drive never ran');
  assert.equal(truth.items['MEL-AUG-01'].truth, 'BROKEN');
  assert.equal(truth.items['MEL-AUG-01'].proofs[0].error, 'NO_ZERO_COST_PROVIDER_AVAILABLE');
  assert.equal(truth.items['GEN2-05'].truth, 'UNPROVEN', 'a 10-day-old success is not current proof');
  assert.equal(truth.items['GEN2-02'].truth, 'DECLARED', 'no automatic proof defined');
  assert.equal(truth.items['GEN2-30'].proofs.find(p => p.id === 'pointer.click').ok, 1, 'second step of a multi-step PC command counts');
  assert.ok(truth.verified_live_percent < 100, 'the real percentage is no longer 100 %');
  assert.equal(truth.counts.VERIFIED_LIVE + truth.counts.PARTIAL_LIVE + truth.counts.BROKEN + truth.counts.UNPROVEN + truth.counts.DECLARED, truth.total);
  d.close();
});

test('every proof source points to a real roadmap item', () => {
  const ids = new Set(flattenRoadmap().map(i => i.id));
  for (const id of Object.keys(ROADMAP_PROOF_SOURCES)) assert.ok(ids.has(id), id);
});

test('without a database the roadmap says so instead of inventing a status', async () => {
  assert.deepEqual(await computeRoadmapTruth(null, MASTER_ROADMAP), { available: false, reason: 'ROADMAP_TRUTH_DB_UNAVAILABLE' });
  const empty = classifyRoadmapItem('MEL-CODE-01', { capabilities: new Map(), computer: new Map() });
  assert.equal(empty.truth, 'UNPROVEN');
});

test('roadmap.read returns the real truth next to the declared roadmap', async () => {
  const { createDefaultCapabilityBus } = await import('../src/capabilities/default-bus.js');
  const d = await db();
  await exec(d, 'code.read', 'SUCCEEDED', 60_000, null, Date.now());
  const bus = createDefaultCapabilityBus({ env: { DB: d } });
  const payload = await bus.execute('roadmap.read', {}, { owner: 'test', permissions: [] });
  assert.equal(payload.summary.complete, 133, 'historical certifications remain unchanged');
  assert.ok(payload.summary.percent_complete < 100, 'founder, manifesto, weekly audits and chat acceptance goals remain open');
  const founder = payload.phases.find(phase => phase.id === 'P16');
  const manifesto = payload.phases.find(phase => phase.id === 'P17');
  assert.equal(founder.items.length, 8);
  assert.equal(founder.items.some(item => item.status === 'DONE_VERIFIED'), false);
  assert.equal(manifesto.items.length, 10);
  assert.equal(manifesto.items.some(item => item.status === 'DONE_VERIFIED'), false);
  assert.equal(payload.truth.available, true);
  assert.equal(payload.truth.items['MEL-CODE-01'].truth, 'VERIFIED_LIVE');
  d.close();
});
