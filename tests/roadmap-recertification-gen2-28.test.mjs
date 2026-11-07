import test from 'node:test';
import assert from 'node:assert/strict';
import { sqliteD1 } from './helpers/sqlite-d1.mjs';
import { createDefaultCapabilityBus } from '../src/capabilities/default-bus.js';
import { ROADMAP_RECERTIFICATION_PROFILES, withRuntimeRecertification } from '../src/roadmap/runtime-recertification.js';
import { ROADMAP_PROOF_SOURCES, ROADMAP_TRUTH_WINDOW_MS } from '../src/roadmap/roadmap-truth.js';
const capability = 'windows.companion-live.verify';
async function fixture(t) {
  const db = sqliteD1(); t.after(() => db.close());
  await db.prepare('CREATE TABLE computer_devices(id TEXT PRIMARY KEY,platform TEXT,halted INTEGER,last_seen_at INTEGER,metadata TEXT)').run();
  await db.prepare('CREATE TABLE computer_commands(id TEXT PRIMARY KEY,device_id TEXT,created_at INTEGER,finished_at INTEGER,status TEXT,plan_json TEXT)').run();
  const now = Date.now(); let sequence = 0;
  const device = async (id = 'pc', overrides = {}) => {
    const row = { id, platform: 'windows', halted: 0, last_seen_at: now,
      metadata: JSON.stringify({ remote_access_enabled: true, engine_heartbeat_at: now }), ...overrides };
    await db.prepare('INSERT OR REPLACE INTO computer_devices VALUES(?,?,?,?,?)')
      .bind(row.id,row.platform,row.halted,row.last_seen_at,row.metadata).run();
  };
  const command = async (actions, { deviceId = 'pc', at = now - 1000, status = 'SUCCEEDED', raw = null } = {}) => {
    await db.prepare('INSERT INTO computer_commands VALUES(?,?,?,?,?,?)')
      .bind(String(++sequence),deviceId,at - 100,at,status,raw ?? JSON.stringify({ steps: actions.map(action => ({ action })) })).run();
  };
  const bus = createDefaultCapabilityBus({ env: { DB: db } });
  const verify = () => bus.execute(capability, {}, { owner: 'proof', permissions: [] });
  return { db, now, device, command, verify };
}
const actions = ['system.info','process.list','screen.capture'];
test('GEN2-28 recertification reads actual same-device terminal receipts without queueing commands', async t => {
  const f = await fixture(t); await f.device(); await f.command(actions);
  const before = await f.db.prepare('SELECT COUNT(*) AS n FROM computer_commands').first();
  assert.deepEqual(await f.verify(), { ok: true, verified_actions: 3 });
  assert.deepEqual(await f.db.prepare('SELECT COUNT(*) AS n FROM computer_commands').first(), before);
  assert.equal(ROADMAP_RECERTIFICATION_PROFILES['GEN2-28'], capability);
  assert.ok(ROADMAP_PROOF_SOURCES['GEN2-28'].capabilities.includes(capability));
  const mapped = withRuntimeRecertification([{ id: 'GEN2-28', status: 'DONE_VERIFIED' }],
    { available: true, items: { 'GEN2-28': { truth: 'PARTIAL_LIVE' } } });
  assert.equal(mapped.length, 1); assert.equal(mapped[0].mode, 'VERIFY_RUNTIME');
});
for (const [name, overrides] of Object.entries({
  absentAuthorization: { metadata: '{}' }, halted: { halted: 1 }, wrongPlatform: { platform: 'android' },
  stalePresence: { last_seen_at: 1 }, malformedMetadata: { metadata: '{' },
  staleEngine: { metadata: JSON.stringify({ remote_access_enabled: true, engine_heartbeat_at: 1 }) },
  futurePresence: { last_seen_at: Date.now() + 100000 },
})) test(`GEN2-28 refuses ${name} even with successful command history`, async t => {
  const f = await fixture(t); await f.device('pc', overrides); await f.command(actions);
  await assert.rejects(f.verify(), { code: 'WINDOWS_COMPANION_OFFLINE_OR_NOT_AUTHORIZED' });
});
test('GEN2-28 cannot combine receipts from different PCs or accept pending/expired commands', async t => {
  const f = await fixture(t); await f.device();
  await f.command(actions.slice(0,2)); await f.command(['screen.capture'], { deviceId: 'other' });
  await f.command(['screen.capture'], { status: 'PENDING' });
  await f.command(['screen.capture'], { at: f.now - ROADMAP_TRUTH_WINDOW_MS - 1000 });
  await f.command([], { raw: '{' });
  await assert.rejects(f.verify(), { code: 'WINDOWS_COMPANION_LIVE_PROOF_INCOMPLETE' });
});
test('GEN2-28 latest executed failure invalidates old success, while later unexecuted steps do not', async t => {
  const f = await fixture(t); await f.device(); await f.command(actions, { at: f.now - 2000 });
  await f.command(['system.info','screen.capture'], { status: 'FAILED', at: f.now - 1500 });
  await assert.rejects(f.verify(), { code: 'WINDOWS_COMPANION_LIVE_PROOF_INCOMPLETE' });
  await f.command(['system.info'], { at: f.now - 1000 });
  assert.equal((await f.verify()).ok, true);
});
test('GEN2-28 rejects missing D1 and incomplete physical evidence', async t => {
  const bus = createDefaultCapabilityBus({ env: {} });
  await assert.rejects(bus.execute(capability, {}, { owner: 'proof', permissions: [] }), { code: 'WINDOWS_COMPANION_PROOF_DB_UNAVAILABLE' });
  const f = await fixture(t); await f.device();
  await assert.rejects(f.verify(), { code: 'WINDOWS_COMPANION_LIVE_PROOF_INCOMPLETE' });
});

test('the delivered recipe frees its obsolete auxiliary mission without certifying the parent or admitting two missions', async t => {
  const { D1DevJobRepository } = await import('../src/dev/d1-dev-job-repository.js');
  const { AutonomySupervisor } = await import('../src/evolution/autonomy-supervisor.js');
  const { flattenRoadmap } = await import('../src/roadmap/master-roadmap.js');
  const db = sqliteD1({ maintenanceFence: true }); t.after(() => db.close());
  const repository = new D1DevJobRepository(db);
  const old = await repository.create({ id: 'old-recipe', requested_by: 'mel-autonomy', goal: 'Prepare Windows proof recipe',
    optional_context: { roadmap_id: 'ROADMAP-PROOF-GEN2-28', source: 'autonomy-supervisor' } });
  await repository.update(old.id, { status: 'TEACHER_APPROVED' });
  const parent = { ...flattenRoadmap().find(row => row.id === 'GEN2-28'), depends_on: [] };
  const roadmap = withRuntimeRecertification([parent], { available: true, items: { 'GEN2-28': { truth: 'PARTIAL_LIVE' } } });
  const result = await new AutonomySupervisor({ repository, roadmap }).ensureNextJob();
  assert.equal((await repository.get(old.id)).status, 'WAITING_DEPENDENCY');
  assert.equal(result.job.optional_context.roadmap_id, 'GEN2-28');
  assert.equal(result.job.optional_context.work_mode, 'VERIFY_RUNTIME');
  assert.notEqual(result.job.status, 'COMPLETED');
  const state = await new AutonomySupervisor({ repository, roadmap }).state();
  assert.equal(state.active.length, 1);
  assert.equal(state.completedIds.includes('GEN2-28'), false);
});
